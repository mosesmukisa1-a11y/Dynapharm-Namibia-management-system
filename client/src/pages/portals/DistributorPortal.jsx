import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatCurrency, formatDate } from '../../lib/constants';
import { enrichProductsWithPricing, calculateCartTotals } from '../../lib/pricing';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Modal, Alert } from '../../components/ui';
import { ShoppingCart, Heart, Newspaper, MessageSquare, Search, Plus, Minus, Package, Trash2, Send, User, BarChart3, ShoppingBag, Star, UserPlus, Printer, MapPin, ChevronDown, TrendingUp, Calendar, Gift, Tag, Zap, Award, Clock, Trophy, CheckCircle, AlertCircle, ChevronRight, Megaphone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { MembershipAgreementForm } from '../../components/MembershipAgreementForm';
import NetworkReportTab from '../../components/NetworkReportTab';

export default function DistributorPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'mybonus', label: 'My Bonus', icon: '💰' },
    { id: 'shop', label: 'Shop', icon: '🛒' },
    { id: 'register', label: 'New Member', icon: '📝' },
    { id: 'bv', label: 'BV & Profit', icon: '📈' },
    { id: 'network', label: 'My Network', icon: '🌐' },
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
        Unable to determine your NB number. Please contact the branch.
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

function MyBonusTab() {
  const { user } = useAuth();
  const [bonuses, setBonuses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [publicNB, setPublicNB] = useState('');
  const [nbInput, setNBInput] = useState('');

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

  const hasOutstanding = bonuses.some(b => (Number(b.amount_earned) - Number(b.amount_paid)) > 0.01);

  return (
    <div className="space-y-5">
      {!user && (
        <Card>
          <CardBody>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Enter your NB Number to view your bonus history</label>
                <input type="text" value={nbInput} onChange={e => setNBInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter' && nbInput.trim()) { setPublicNB(nbInput.trim()); fetchBonuses(nbInput.trim()); } }}
                  placeholder="e.g. NB001234"
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

          {summary && (
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl p-4 text-white bg-gradient-to-br from-green-500 to-green-700 text-center">
                <p className="text-xs opacity-80 uppercase tracking-wide">Total Earned</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(summary.totalEarned || 0)}</p>
              </div>
              <div className="rounded-xl p-4 text-white bg-gradient-to-br from-blue-500 to-blue-700 text-center">
                <p className="text-xs opacity-80 uppercase tracking-wide">Total Paid</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(summary.totalPaid || 0)}</p>
              </div>
              <div className={`rounded-xl p-4 text-white bg-gradient-to-br ${(summary.totalOutstanding || 0) > 0 ? 'from-orange-500 to-orange-700' : 'from-gray-400 to-gray-600'} text-center`}>
                <p className="text-xs opacity-80 uppercase tracking-wide">Outstanding</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(summary.totalOutstanding || 0)}</p>
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <span>💰</span> My Bonus History {publicNB && <span className="text-sm font-normal text-gray-500">— {publicNB}</span>}
              </h3>
            </CardHeader>
            {bonuses.length === 0 ? (
              <CardBody>
                <p className="text-center text-gray-400 py-6 text-sm">No bonus records found. Bonuses are uploaded by Finance each month.</p>
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
                    {bonuses.map(b => {
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

          {bonuses.some(b => (b.payments || []).length > 0) && (
            <Card>
              <CardHeader><h3 className="font-bold text-gray-800">Payment Details</h3></CardHeader>
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
                    {bonuses.flatMap(b => (b.payments || []).map(p => (
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

  useEffect(() => {
    if (user?.username) {
      const nbCode = user.username.toUpperCase();
      setPublicNBCode(nbCode);
      fetchByNB(nbCode);
    } else {
      setLoading(false);
    }
  }, [user]);

  if (loading) return <LoadingSpinner />;

  const myOrders = orders;
  const onlineSpent = myOrders.reduce((sum, o) => sum + Number(o.total_amount || o.subtotal || 0), 0);
  const branchSpent = branchSales.reduce((sum, s) => sum + Number(s.total || s.totalAmount || 0), 0);
  const totalSpent = onlineSpent + branchSpent;
  const onlineBV = myOrders.reduce((sum, o) => {
    const items = typeof o.items === 'string' ? JSON.parse(o.items || '[]') : (o.items || []);
    return sum + items.reduce((s, i) => s + Number(i.bv || 0) * Number(i.quantity || 1), 0);
  }, 0);
  const branchBV = branchSales.reduce((sum, s) => sum + Number(s.totalBV || s.total_bv || 0), 0);
  const totalBV = onlineBV + branchBV;

  const displayName = profile?.distributor_name || user?.full_name || publicNBCode || 'Distributor';
  const nbNumber = profile?.distributor_code || publicNBCode || '';
  const position = profile?.position || 'Distributor';
  const dateJoined = profile?.date_joined || (user?.created_at ? formatDate(user.created_at) : 'N/A');

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
                  placeholder="e.g. NB001234"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
              </div>
              <Button onClick={() => { const nb = nbInput.trim(); if (nb) { setPublicNBCode(nb); fetchByNB(nb); } }}>Look Up</Button>
            </div>
            {publicNBCode && <p className="text-xs text-gray-500 mt-2">Showing dashboard for: <strong>{publicNBCode}</strong></p>}
          </CardBody>
        </Card>
      )}
      <div className="bg-gradient-to-r from-primary to-primary-dark rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <User size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{displayName}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="bg-white/20 px-3 py-0.5 rounded-full text-xs font-semibold">{nbNumber}</span>
                <span className="bg-white/20 px-3 py-0.5 rounded-full text-xs font-semibold">{position}</span>
              </div>
            </div>
          </div>
          {profile && (
            <button onClick={() => printDistributorProfile(profile)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold cursor-pointer transition-colors">
              <Printer size={14} /> Print Profile
            </button>
          )}
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
                  const items = (() => { try { return typeof order.items === 'string' ? JSON.parse(order.items) : (Array.isArray(order.items) ? order.items : []); } catch { return []; } })();
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
      api.products.list().catch(() => []),
      api.branches.list().catch(() => []),
    ]).then(([prodData, branchData]) => {
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
    if (!monthlyData[month]) monthlyData[month] = { orders: 0, branchSales: 0, amount: 0, bv: 0, profit: 0 };
    monthlyData[month].orders += 1;
    const amt = Number(o.total_amount || o.subtotal || 0);
    monthlyData[month].amount += amt;
    const items = typeof o.items === 'string' ? JSON.parse(o.items || '[]') : (o.items || []);
    items.forEach(i => {
      monthlyData[month].bv += Number(i.bv || 0) * Number(i.quantity || 1);
      const dp = Number(i.unit_price || i.dp || 0);
      const cp = Number(i.cp || dp * 1.3);
      monthlyData[month].profit += (cp - dp) * Number(i.quantity || 1);
    });
  });
  branchSales.forEach(s => {
    const date = s.sale_date || s.saleDate || s.created_at || s.timestamp || '';
    const month = date.slice(0, 7);
    if (!month) return;
    if (!monthlyData[month]) monthlyData[month] = { orders: 0, branchSales: 0, amount: 0, bv: 0, profit: 0 };
    monthlyData[month].branchSales += 1;
    monthlyData[month].amount += Number(s.total || s.totalAmount || 0);
    monthlyData[month].bv += Number(s.totalBV || s.bv || 0);
    const items = Array.isArray(s.products) ? s.products : [];
    items.forEach(i => {
      const dp = Number(i.dpPrice || i.dp || 0);
      const cp = Number(i.cpPrice || i.cp || i.unit_price || (dp > 0 ? dp * 1.3 : 0));
      const qty = Number(i.quantity || i.qty || 1);
      if (dp > 0 && cp > dp) monthlyData[month].profit += (cp - dp) * qty;
    });
  });

  const months = Object.entries(monthlyData).sort((a, b) => b[0].localeCompare(a[0]));
  const totalBV = months.reduce((s, [, d]) => s + d.bv, 0);
  const totalProfit = months.reduce((s, [, d]) => s + d.profit, 0);

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
                  placeholder="e.g. NB001234"
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
        <StatCard title="Total BV" value={totalBV.toFixed(1)} color="blue" />
        <StatCard title="Est. Profit" value={formatCurrency(totalProfit)} color="green" />
        <StatCard title="Total Transactions" value={orders.length + branchSales.length} color="purple" />
        <StatCard title="Months Active" value={months.length} color="orange" />
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><BarChart3 size={18} /> Monthly BV & Profit Breakdown</h3></CardHeader>
        <CardBody>
          {months.length === 0 ? (
            <EmptyState icon={<BarChart3 size={48} />} title="No Data Yet" description="Your BV will appear here when branch sales or online orders are linked to your NB number." />
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
                      {' | '}Total: {formatCurrency(data.amount)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-600">{data.bv.toFixed(1)} BV</p>
                    <p className="text-sm font-bold text-green-600">{formatCurrency(data.profit)} profit</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {profitLedger.length > 0 && (() => {
        const pendingEntries = profitLedger.filter(e => e.status === 'pending');
        const paidEntries = profitLedger.filter(e => e.status === 'paid');
        const pendingTotal = pendingEntries.reduce((s, e) => s + Number(e.profit_amount || 0), 0);
        const paidTotal = paidEntries.reduce((s, e) => s + Number(e.profit_amount || 0), 0);
        return (
          <Card>
            <CardHeader>
              <h3 className="font-bold text-gray-800 flex items-center gap-2">💰 Retail Profit Ledger</h3>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-3 bg-red-50 rounded-lg text-center">
                  <p className="text-xs text-red-600 font-semibold uppercase tracking-wide mb-1">Pending Payment</p>
                  <p className="text-xl font-black text-red-700">{formatCurrency(pendingTotal)}</p>
                  <p className="text-xs text-red-500">{pendingEntries.length} sale(s) unpaid</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-1">Paid Out</p>
                  <p className="text-xl font-black text-green-700">{formatCurrency(paidTotal)}</p>
                  <p className="text-xs text-green-500">{paidEntries.length} sale(s) paid</p>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {profitLedger.slice(0, 20).map((e, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 text-sm">
                    <div>
                      <span className="font-mono text-xs text-gray-500 mr-2">{e.sale_receipt || e.sale_id || '—'}</span>
                      <span className="text-gray-600">{e.sale_date ? new Date(e.sale_date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-bold ${e.status === 'paid' ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(Number(e.profit_amount))}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${e.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {e.status === 'paid' ? '✓ Paid' : '⏳ Pending'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {pendingTotal > 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded p-2 mt-3">⚠️ You have {formatCurrency(pendingTotal)} pending. Contact your branch to arrange payment.</p>
              )}
            </CardBody>
          </Card>
        );
      })()}

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">BV Accumulation Guide</h3></CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="font-bold text-blue-800 mb-1">Personal BV</p>
              <p className="text-blue-600">BV earned from your own purchases at Distributor Price (DP).</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="font-bold text-green-800 mb-1">Retail Profit</p>
              <p className="text-green-600">Difference between Consumer Price (CP) and Distributor Price (DP) on retail sales.</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="font-bold text-purple-800 mb-1">Group BV</p>
              <p className="text-purple-600">Combined BV from your downline network for bonus qualification.</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function CommunicationsTab() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState({ subject: '', message: '' });
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const code = user?.distributor_code || user?.username || '';
    api.get(`/notifications?recipient_id=${encodeURIComponent(code)}`)
      .then(d => setNotifications(Array.isArray(d) ? d : d.notifications || []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, [user]);

  const [sendError, setSendError] = useState('');

  const handleSend = async (e) => {
    e.preventDefault();
    if (!composeForm.subject || !composeForm.message) return;
    setSendError('');
    try {
      await api.notifications.create({
        title: composeForm.subject,
        message: composeForm.message,
        type: 'distributor_message',
        recipient_type: 'admin',
        recipient_id: 'ADMIN',
        metadata: JSON.stringify({ sender: user?.full_name || user?.username || 'Distributor', sender_id: user?.distributor_code || user?.username }),
      });
      setSent(true);
      setComposeForm({ subject: '', message: '' });
      setComposeOpen(false);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      setSendError(err.message || 'Failed to send message. Please try again.');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {sent && <Alert type="success">Message sent successfully!</Alert>}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">Messages & Announcements</h3>
        <Button size="sm" onClick={() => setComposeOpen(true)}><Send size={14} /> Compose</Button>
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={<MessageSquare size={48} />} title="No Messages" description="No announcements or messages at this time." />
      ) : (
        <div className="space-y-3">
          {notifications.map((n, idx) => (
            <Card key={n.id || idx}>
              <CardBody>
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-800">{n.title || 'Announcement'}</h4>
                    <p className="text-sm text-gray-600 mt-1">{n.message || n.content}</p>
                    {n.sender && <p className="text-xs text-gray-400 mt-2">From: {n.sender}</p>}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                    {n.created_at ? new Date(n.created_at).toLocaleDateString() : ''}
                  </span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="Compose Message">
        <form onSubmit={handleSend} className="p-6 space-y-4">
          {sendError && <Alert type="error">{sendError}</Alert>}
          <Input label="Subject" value={composeForm.subject} onChange={e => setComposeForm(f => ({ ...f, subject: e.target.value }))} required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={composeForm.message}
              onChange={e => setComposeForm(f => ({ ...f, message: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[120px] resize-y"
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button type="submit"><Send size={14} /> Send</Button>
          </div>
        </form>
      </Modal>
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
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.notifications.list()
      .then(d => setNews(Array.isArray(d) ? d : d.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  if (news.length === 0) {
    return <EmptyState icon={<Newspaper size={48} />} title="Media & News" description="Stay updated with the latest Dynapharm news, events, and product announcements." />;
  }

  return (
    <div className="space-y-4">
      {news.map((item, idx) => (
        <Card key={item.id || idx}>
          <CardBody>
            <h3 className="font-bold text-gray-800 mb-1">{item.title || 'Announcement'}</h3>
            <p className="text-sm text-gray-600">{item.message || item.content || item.description}</p>
            {item.created_at && <p className="text-xs text-gray-400 mt-2">{new Date(item.created_at).toLocaleDateString()}</p>}
          </CardBody>
        </Card>
      ))}
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
      api.products.list().catch(() => []),
      api.branches.list().catch(() => []),
    ]).then(([campData, prodData, branchData]) => {
      const camps = Array.isArray(campData) ? campData : campData.campaigns || [];
      setCampaigns(camps);
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
                  {camp.campaign_type === 'buy_x_get_y' && (
                    <div className="mb-3 p-3 bg-green-50 rounded-lg border border-green-200 text-sm space-y-1">
                      <p className="font-bold text-green-800 flex items-center gap-1"><Gift size={14} /> Buy & Get Free Deal</p>
                      <p className="text-green-700">Buy <strong>{conditions.buy_qty || 1}</strong> unit{(conditions.buy_qty || 1) > 1 ? 's' : ''}, get <strong>{conditions.get_qty || 1}</strong> free</p>
                      {conditions.products_text && (
                        <p className="text-xs text-gray-600">Eligible products: <strong>{conditions.products_text}</strong></p>
                      )}
                      {prize.free_product && (
                        <p className="text-xs text-gray-600">Free item: <strong>{prize.free_product}</strong></p>
                      )}
                    </div>
                  )}

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

  // For buy_x_get_y: eligible products come from conditions.products_text first,
  // then fall back to prize.free_product (paid item is the same product you get free),
  // then fall back to the campaign name itself for partial matches.
  const rawEligibleNames = conditions.products_text
    ? conditions.products_text.split(',').map(p => p.trim().toLowerCase()).filter(Boolean)
    : freeProductName
      ? [freeProductName.toLowerCase()]
      : [];

  const eligibleProducts = isBuyXGetY && rawEligibleNames.length > 0
    ? products.filter(p =>
        rawEligibleNames.some(n => (p.name || p.description || '').toLowerCase().includes(n))
      )
    : products;

  // For discount: any product
  const allProducts = products;

  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qty, setQty] = useState(isBuyXGetY ? buyQty : 1);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  const selectedBranch = branches.find(b => b.id === selectedBranchId) || null;
  const selectedProduct = products.find(p => (p.id || p.description) === selectedProductId) || null;

  // Auto-select when only one eligible product (or any first match)
  useEffect(() => {
    const pool = isBuyXGetY && rawEligibleNames.length > 0 ? eligibleProducts : allProducts;
    if (pool.length > 0 && !selectedProductId) {
      setSelectedProductId(pool[0].id || pool[0].description);
    }
  }, [eligibleProducts.length, allProducts.length]);

  // Calculations
  const baseDp = selectedProduct?.dp || 0;
  const bvPerUnit = selectedProduct?.bv || 0;
  const unitPrice = isDiscount ? Math.round(baseDp * (1 - discountPct / 100) * 100) / 100 : baseDp;
  const totalCost = unitPrice * qty;
  const totalBV = bvPerUnit * qty;
  const freeItems = isBuyXGetY ? Math.floor(qty / buyQty) * getQty : 0;

  const handleSubmit = async () => {
    if (!selectedBranchId) { setMessage('Error: Please select a branch.'); return; }
    if (!selectedProduct) { setMessage('Error: Please select a product.'); return; }
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

            {/* Product selector */}
            {isBuyXGetY && eligibleProducts.length === 1 ? (
              /* Single campaign product — show as read-only pill, no dropdown needed */
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Campaign Product</label>
                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-300 rounded-lg">
                  <Package size={18} className="text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{eligibleProducts[0].name || eligibleProducts[0].description}</p>
                    <p className="text-xs text-gray-500">DP: {formatCurrency(eligibleProducts[0].dp || 0)} &nbsp;|&nbsp; {eligibleProducts[0].bv || 0} BV per unit</p>
                  </div>
                  <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0">Campaign Product</span>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {isBuyXGetY && eligibleProducts.length > 0 ? `Eligible Products (${eligibleProducts.length})` : 'Select Product'} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                    <option value="">— Select a product —</option>
                    {(isBuyXGetY && rawEligibleNames.length > 0 ? eligibleProducts : allProducts).map(p => (
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

      {!loading && tab === 'schedule' && (
        schedules.length === 0
          ? <EmptyState icon={<span style={{ fontSize: 40 }}>📅</span>} title="No upcoming sessions" description="Scheduled training sessions will appear here. Check back soon!" />
          : <div className="space-y-3">
              {schedules.map((s, i) => (
                <Card key={s.id || i}>
                  <CardBody>
                    <div className="flex items-start gap-4">
                      <div style={{ minWidth: 52, textAlign: 'center', background: '#fef2f2', borderRadius: 10, padding: '8px 4px' }}>
                        <div style={{ fontSize: '0.7rem', color: '#c41e3a', fontWeight: 700, textTransform: 'uppercase' }}>{s.date ? new Date(s.date).toLocaleDateString('en-NA', { month: 'short' }) : '—'}</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#c41e3a', lineHeight: 1 }}>{s.date ? new Date(s.date).getDate() : '—'}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="font-bold text-gray-800">{s.title}</div>
                        <div className="text-sm text-gray-500">{[s.time, s.location].filter(Boolean).join(' · ')}</div>
                        {s.trainer && <div className="text-xs text-gray-400 mt-1">Trainer: {s.trainer}</div>}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
      )}
    </div>
  );
}

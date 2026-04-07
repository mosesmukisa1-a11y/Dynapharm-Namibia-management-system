import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatCurrency, formatDate } from '../../lib/constants';
import { enrichProductsWithPricing, calculateCartTotals } from '../../lib/pricing';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Modal, Alert } from '../../components/ui';
import { ShoppingCart, Heart, Newspaper, MessageSquare, Search, Plus, Minus, Package, Trash2, Send, User, BarChart3, ShoppingBag, Star, UserPlus, Printer } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderMode, setOrderMode] = useState('own'); // 'own' | 'client'
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  const nb = (user?.username || '').toUpperCase();

  useEffect(() => {
    api.products.list()
      .then(data => {
        const raw = Array.isArray(data) ? data : data.products || [];
        setProducts(enrichProductsWithPricing(raw));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  // For own stock: DP pricing. For client stock: show DP (distributor cost) + CP (retail to client) for reference
  const cartTotals = calculateCartTotals(cart, true);

  // For client orders compute potential retail profit (CP - DP per item)
  const clientCartProfit = cart.reduce((sum, item) => {
    const product = products.find(p => (p.id || p.description) === (item.id || item.description));
    if (!product) return sum;
    const cp = product.cp || 0;
    const dp = product.dp || 0;
    return sum + (cp - dp) * item.qty;
  }, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (orderMode === 'client' && !clientName.trim()) {
      setMessage('Error: Please enter the client name for a Client Stock order.');
      return;
    }
    setSubmitting(true);
    try {
      if (orderMode === 'own') {
        await api.orders.create({
          customer_name: nb || 'Distributor Order',
          delivery_method: 'pickup',
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
          notes: `Own Stock — Distributor purchase | Pricing: DP | Total BV: ${cartTotals.totalBV.toFixed(1)} | NB: ${nb}`,
        });
        setMessage('Own stock order submitted! Branch will process your order.');
      } else {
        // Client stock — referral order, branch records profit for this distributor
        await api.orders.create({
          customer_name: clientName.trim(),
          customer_phone: clientPhone.trim() || undefined,
          delivery_method: 'pickup',
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
          notes: `Client Stock — Referred by ${nb} | Client: ${clientName.trim()}${clientPhone.trim() ? ' (' + clientPhone.trim() + ')' : ''} | Potential Profit: N$${clientCartProfit.toFixed(2)} | Pricing: DP (distributor cost)`,
        });
        setMessage(`Client stock order for ${clientName.trim()} submitted! Branch will process and credit your retail profit.`);
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

      {/* Order mode selector */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <button onClick={() => { setOrderMode('own'); setCart([]); }}
          className="p-3 rounded-xl border-2 text-left cursor-pointer transition-all"
          style={{
            borderColor: orderMode === 'own' ? '#c41e3a' : '#e2e8f0',
            background: orderMode === 'own' ? '#fff5f5' : '#fff',
          }}>
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag size={18} style={{ color: orderMode === 'own' ? '#c41e3a' : '#94a3b8' }} />
            <span className={`font-bold text-sm ${orderMode === 'own' ? 'text-[#c41e3a]' : 'text-gray-600'}`}>Own Stock</span>
            {orderMode === 'own' && <span className="ml-auto text-[#c41e3a] text-xs font-bold">✓ Selected</span>}
          </div>
          <p className="text-xs text-gray-500">Buy for yourself at Distributor Price (DP). BV points credited to your account.</p>
        </button>
        <button onClick={() => { setOrderMode('client'); setCart([]); }}
          className="p-3 rounded-xl border-2 text-left cursor-pointer transition-all"
          style={{
            borderColor: orderMode === 'client' ? '#1e40af' : '#e2e8f0',
            background: orderMode === 'client' ? '#eff6ff' : '#fff',
          }}>
          <div className="flex items-center gap-2 mb-1">
            <User size={18} style={{ color: orderMode === 'client' ? '#1e40af' : '#94a3b8' }} />
            <span className={`font-bold text-sm ${orderMode === 'client' ? 'text-blue-700' : 'text-gray-600'}`}>Client Stock</span>
            {orderMode === 'client' && <span className="ml-auto text-blue-700 text-xs font-bold">✓ Selected</span>}
          </div>
          <p className="text-xs text-gray-500">Order for a client. Branch records a referral sale — you earn the retail profit (CP − DP).</p>
        </button>
      </div>

      {/* Client details for client stock */}
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
          <p className="text-xs text-blue-600">
            You will be tagged as the referral distributor. After the branch processes this order, your retail profit will appear in your BV & Profit tab.
          </p>
        </div>
      )}

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

      <div className={`mb-3 px-3 py-2 rounded-lg text-sm font-medium border ${orderMode === 'own' ? 'bg-primary/5 border-primary/20 text-primary' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
        {orderMode === 'own'
          ? 'Own Stock — Distributor Price (DP) with BV tracking'
          : 'Client Stock — Ordered at DP cost; client pays CP at branch. You earn the margin.'}
      </div>

      {cart.length > 0 && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
          <span className="text-sm text-green-700">
            <strong>{cart.reduce((s, c) => s + c.qty, 0)}</strong> items | Total (DP): <strong>{formatCurrency(cartTotals.totalAmount)}</strong> | BV: <strong>{cartTotals.totalBV.toFixed(1)}</strong>
            {orderMode === 'client' && clientCartProfit > 0 && <span className="ml-2 text-blue-700"> | Est. Profit: <strong>{formatCurrency(clientCartProfit)}</strong></span>}
          </span>
          <Button size="sm" variant="success" onClick={() => setShowCart(true)}>View Cart</Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((product, idx) => {
          const imgSrc = (product.images && product.images.length > 0) ? (product.images[0].image_data || product.images[0].image_url || '') : '';
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
                <h3 className="font-semibold text-gray-900 text-sm mb-1">{product.name || product.description}</h3>
                <div className="flex items-center justify-between mt-2">
                  <div>
                    <span className="text-lg font-bold text-primary">{formatCurrency(product.dp)}</span>
                    <span className="text-xs text-gray-400 ml-1">DP</span>
                    {product.bv > 0 && <span className="text-xs text-blue-600 ml-2">{product.bv} BV</span>}
                  </div>
                  <Button size="sm" onClick={() => addToCart(product)}><Plus size={14} /> Add</Button>
                </div>
                {product.cp > product.dp && (
                  <p className="text-xs text-gray-400 mt-1">
                    Retail (CP): {formatCurrency(product.cp)}
                    {orderMode === 'client' && <span className="text-green-600 font-semibold ml-1">+{formatCurrency(product.cp - product.dp)} profit</span>}
                  </p>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Modal open={showCart} onClose={() => setShowCart(false)} title={orderMode === 'own' ? 'Cart — Own Stock' : `Cart — Client Stock${clientName ? ': ' + clientName : ''}`} size="lg">
        <div className="p-6">
          {cart.length === 0 ? (
            <EmptyState icon={<ShoppingCart size={48} />} title="Cart is Empty" description="Add products to your cart to place an order." />
          ) : (
            <div>
              {orderMode === 'client' && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm">
                  <span className="font-semibold text-blue-800">Client:</span> {clientName || <span className="text-red-500 italic">Not entered — please go back and fill in client name</span>}
                  {clientPhone && <span className="text-gray-500 ml-2">({clientPhone})</span>}
                </div>
              )}
              <div className="space-y-3 mb-6">
                {cartTotals.items.map((item, idx) => {
                  const product = products.find(p => (p.id || p.description) === (item.id || item.description));
                  const profit = product ? ((product.cp || 0) - (product.dp || 0)) * item.qty : 0;
                  return (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{item.name || item.description}</p>
                        <p className="text-xs text-gray-500">{formatCurrency(item.unitPrice)} x {item.qty} = {formatCurrency(item.lineTotal)}</p>
                        {item.lineBV > 0 && <p className="text-xs text-blue-500">{item.lineBV.toFixed(1)} BV</p>}
                        {orderMode === 'client' && profit > 0 && <p className="text-xs text-green-600 font-semibold">Est. profit: {formatCurrency(profit)}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQty(item.id || item.description, -1)}
                          className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center cursor-pointer hover:bg-gray-300">
                          <Minus size={14} />
                        </button>
                        <span className="text-sm font-bold w-6 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item.id || item.description, 1)}
                          className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center cursor-pointer hover:bg-gray-300">
                          <Plus size={14} />
                        </button>
                        <button onClick={() => removeFromCart(item.id || item.description)}
                          className="ml-2 text-red-400 hover:text-red-600 cursor-pointer">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total (DP cost)</span>
                  <span className="font-bold">{formatCurrency(cartTotals.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total BV</span>
                  <span className="font-bold text-primary">{cartTotals.totalBV.toFixed(1)}</span>
                </div>
                {orderMode === 'client' && clientCartProfit > 0 && (
                  <div className="flex justify-between text-sm text-green-700 font-semibold">
                    <span>Estimated Retail Profit</span>
                    <span>{formatCurrency(clientCartProfit)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(cartTotals.totalAmount)}</span>
                </div>
              </div>

              <div className="mt-6 flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowCart(false)}>Continue Shopping</Button>
                <Button variant="success" onClick={handleCheckout} disabled={submitting}>
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
  const navigate = useNavigate();
  return (
    <Card>
      <CardBody>
        <div className="text-center py-8">
          <Heart size={48} className="text-primary mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-800 mb-2">Full Body Check Up</h3>
          <p className="text-gray-500 mb-6">Get a comprehensive health assessment at any Dynapharm branch.</p>
          <Button onClick={() => navigate('/checkup')}>Book a Check Up</Button>
        </div>
      </CardBody>
    </Card>
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

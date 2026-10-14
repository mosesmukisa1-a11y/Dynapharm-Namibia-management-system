import { useState, useEffect, useCallback, useRef } from 'react';
import { BarChart3, TrendingUp, DollarSign, Ship } from 'lucide-react';
import { api } from '../lib/api';
import { namibiaDay } from '../lib/saleEvidence.js';
import { getLiveProductList, setLivePrices } from '../lib/pricing';
import { formatCurrency } from '../lib/constants';
import { Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, StatCard, Modal } from './ui';

export default function SavedSaleProfitReport() {
  const today=namibiaDay();
  const [startDate, setStartDate] = useState(today.slice(0,8)+'01');
  const [endDate, setEndDate] = useState(today);
  const [qtySoldMap, setQtySoldMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [campaignPrices, setCampaignPrices] = useState({});
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [campaignPrice, setCampaignPrice] = useState('');
  const [profitError,setProfitError]=useState(null);
  const latestRequest = useRef(0);
  const selectedRange = useRef({ startDate, endDate });

  const selectDate = (field, setDate, value) => {
    // Selection takes effect immediately, even before React runs the reload effect.
    selectedRange.current = { ...selectedRange.current, [field]: value };
    setDate(value);
  };

  const load = useCallback(() => {
    const requestId = ++latestRequest.current;
    const isCurrent = () => requestId === latestRequest.current
      && startDate === selectedRange.current.startDate
      && endDate === selectedRange.current.endDate;
    setLoading(true);
    setProfitError(null);
    Promise.all([
      api.director.profitAnalysis({ startDate, endDate }),
      api.prices.list(),
    ]).then(([res, prices]) => {
      if (!isCurrent()) return;
      if (Array.isArray(prices) && prices.length > 0) setLivePrices(prices);
      const map = {};
      (res?.products || []).forEach(p => {
        map[p.productName] = p;
      });
      setQtySoldMap(map);
    })
    .catch(e => {
      if (!isCurrent()) return;
      setQtySoldMap({});
      setProfitError(e.message);
    })
    .finally(() => {
      if (isCurrent()) setLoading(false);
    });
  }, [startDate, endDate]);

  useEffect(() => {
    load();
    return () => { latestRequest.current += 1; };
  }, [load]);

  const profitRows = Object.values(qtySoldMap).map(p => {
    const qtySold = p.qtySold;
    const campaign = campaignPrices[p.productName];
    const sellingPrice=p.missingDpQuantity ? null : p.revenueDp/qtySold;
    const chargedUnit=p.missingChargedQuantity ? null : p.chargedTotal/qtySold;
    const profit=p.actualProfit==null ? null : p.actualProfit/qtySold;
    const totalProfit=p.actualProfit;
    const margin=p.actualProfit==null || !p.chargedTotal ? null : p.actualProfit/p.chargedTotal*100;
    return {
      product_name:p.productName,cif:p.missingCostQuantity ? null : p.cifCost/qtySold,
      dp:sellingPrice,cp:chargedUnit,charged_total:p.chargedTotal,received_cost:p.cifCost,dp_total:p.revenueDp,
      campaign_price: campaign ?? null, selling_price: sellingPrice,
      profit_per_unit: profit, margin:margin==null?null:Math.round(margin*10)/10,
      qty_sold: qtySold, total_profit: totalProfit,commercial_margin:p.commercialMargin,
    };
  }).sort((a, b) => (b.total_profit ?? 0) - (a.total_profit ?? 0));

  const totalCIF    = profitRows.reduce((s, r) => s + r.received_cost, 0);
  const totalRevenue = profitRows.reduce((s, r) => s + r.charged_total, 0);
  const grandProfit  = profitRows.reduce((s, r) => s + (r.total_profit ?? 0), 0);
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
                <h3 className="font-bold text-emerald-900">Profit Analysis — Saved Sale Evidence</h3>
                <p className="text-sm text-emerald-700 mt-1">Commercial margin = charged receipts − saved DP. Actual profit = charged receipts − original received CIF cost. Catalogue/scenario prices never reprice these sales.</p>
                <p className="text-sm text-emerald-700">Saved DP (known): {formatCurrency(profitRows.reduce((n,r)=>n+r.dp_total,0))} · Customer receipts (known): {formatCurrency(totalRevenue)}</p>
                {profitRows.some(r=>r.dp==null || r.cif==null || r.cp==null) && <p className="text-amber-800">Incomplete original evidence: totals include only known values.</p>}
              </div>
            </div>
            <div className="flex gap-2 items-end">
              <div>
                <label className="block text-xs font-semibold text-emerald-800 mb-1">From</label>
                <input type="date" value={startDate} onChange={e => selectDate('startDate', setStartDate, e.target.value)} className="border border-emerald-300 rounded px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-emerald-800 mb-1">To</label>
                <input type="date" value={endDate} onChange={e => selectDate('endDate', setEndDate, e.target.value)} className="border border-emerald-300 rounded px-2 py-1 text-sm" />
              </div>
              <Button size="sm" onClick={load} className="mb-0.5">Apply</Button>
            </div>
          </div>
        </CardBody>
      </Card>
      {profitError && <div role="alert" className="text-red-700">Unable to load saved sale evidence: {profitError}</div>}
      {loading ? <LoadingSpinner /> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard title="Total CIF Cost" value={formatCurrency(totalCIF)} color="red" icon={<Ship size={24} />} />
            <StatCard title="Customer charged receipts (known)" value={formatCurrency(totalRevenue)} color="blue" icon={<DollarSign size={24} />} />
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
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Original CIF/unit</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Saved DP/unit</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Charged/unit</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Commercial margin</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Scenario DP only</th>
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
                      <td className="px-4 py-2.5 text-right text-red-600 font-medium">{r.cif==null?'Incomplete':formatCurrency(r.cif)}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{r.dp==null?'Incomplete':formatCurrency(r.dp)}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{r.cp==null?'Incomplete':formatCurrency(r.cp)}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{r.commercial_margin==null?'Incomplete':formatCurrency(r.commercial_margin)}</td>
                      <td className="px-4 py-2.5 text-right">{r.campaign_price ? <span className="text-orange-600 font-medium">{formatCurrency(r.campaign_price)}</span> : '-'}</td>
                      <td className="px-4 py-2.5 text-right text-green-700 font-bold">{r.profit_per_unit==null?'Incomplete':formatCurrency(r.profit_per_unit)}</td>
                      <td className="px-4 py-2.5 text-right"><span className={`font-medium ${r.margin >= 50 ? 'text-green-600' : r.margin >= 30 ? 'text-blue-600' : 'text-orange-600'}`}>{r.margin==null?'Incomplete':`${r.margin}%`}</span></td>
                      <td className="px-4 py-2.5 text-right font-medium">{r.qty_sold > 0 ? r.qty_sold : '-'}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-green-700">{r.total_profit==null?'Incomplete':formatCurrency(r.total_profit)}</td>
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

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const blankPack = () => ({ unit: '', factor: '', barcode: '' });

export default function StockProductPacks({ onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [productName, setProductName] = useState('');
  const [baseUnit, setBaseUnit] = useState('');
  const [packs, setPacks] = useState([blankPack()]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.stock.productPacks();
      setRows(Array.isArray(result?.rows) ? result.rows : []);
    } catch (e) {
      setError(e.message || 'Could not load pack and barcode configuration.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const choose = (row) => {
    setProductName(row.product_name || '');
    setBaseUnit(row.base_unit || '');
    setPacks(row.packs?.length ? row.packs.map(p => ({ unit: p.unit || '', factor: String(p.factor ?? ''), barcode: p.barcode || '' })) : [blankPack()]);
    setNotice('');
  };
  const save = async (event) => {
    event.preventDefault();
    const cleanPacks = packs.filter(p => p.unit.trim()).map(p => ({
      unit: p.unit.trim(),
      factor: Number(p.factor),
      barcode: p.barcode.trim() || null,
    }));
    if (!productName.trim() || !baseUnit.trim() || cleanPacks.some(p => !Number.isFinite(p.factor) || p.factor <= 0)) {
      setError('Enter a product, base unit, and a positive conversion factor for each named pack.');
      return;
    }
    if (!cleanPacks.some(p => p.unit === baseUnit.trim() && p.factor === 1)) cleanPacks.unshift({ unit: baseUnit.trim(), factor: 1, barcode: null });
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.stock.saveProductPacks({ productName: productName.trim(), baseUnit: baseUnit.trim(), packs: cleanPacks });
      setNotice('Pack conversions and barcodes saved.');
      await load();
    } catch (e) {
      setError(e.message || 'Could not save this pack configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3" style={{ zIndex: 10001 }} role="dialog" aria-modal="true" aria-label="Pack and barcode configuration">
      <section className="w-full max-w-4xl max-h-[92dvh] overflow-y-auto rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div><p className="m-0 text-xs font-bold uppercase tracking-widest text-rose-700">Receiving setup</p><h2 className="m-0 mt-1 text-xl font-bold text-slate-800">Pack sizes & barcodes</h2><p className="m-0 mt-1 text-sm text-slate-500">Conversions are explicit. A base unit always equals one base unit.</p></div>
          <button type="button" className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={onClose}>Close</button>
        </header>
        <div className="grid gap-5 p-5 md:grid-cols-[250px_1fr]">
          <aside>
            <button type="button" onClick={() => { setProductName(''); setBaseUnit(''); setPacks([blankPack()]); setNotice(''); setError(''); }} className="mb-3 w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left text-sm font-semibold text-rose-800">Add product pack setup</button>
            {loading ? <div className="space-y-2">{[1,2,3].map(n => <div key={n} className="h-10 animate-pulse rounded bg-slate-100" />)}</div> :
              rows.length ? <div className="max-h-80 space-y-1 overflow-auto">{rows.map((r, i) => <button type="button" key={`${r.product_name}-${i}`} onClick={() => choose(r)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${productName === r.product_name ? 'bg-rose-100 text-rose-900' : 'hover:bg-slate-50'}`}><span className="block font-semibold">{r.product_name}</span><span className="text-xs text-slate-500">{r.base_unit} · {r.packs?.length || 0} units</span></button>)}</div> :
                <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">No saved pack configurations yet.</p>}
          </aside>
          <form onSubmit={save} className="space-y-4">
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error} <button type="button" className="ml-2 underline" onClick={load}>Retry</button></div>}
            {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Product name<input required value={productName} onChange={e => setProductName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium text-slate-700">Base unit<input required value={baseUnit} onChange={e => setBaseUnit(e.target.value)} placeholder="e.g. tablet" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_100px_1fr_34px] gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><span>Unit name</span><span>Factor</span><span>Barcode</span><span /></div>
              {packs.map((pack, index) => <div key={index} className="grid grid-cols-[1fr_100px_1fr_34px] gap-2">
                <input aria-label={`Pack unit ${index + 1}`} value={pack.unit} onChange={e => setPacks(ps => ps.map((p, i) => i === index ? { ...p, unit: e.target.value } : p))} placeholder="carton" className="min-w-0 rounded-lg border border-slate-300 px-2 py-2 text-sm" />
                <input aria-label={`Base units per pack ${index + 1}`} type="number" min="0.000001" step="any" value={pack.factor} onChange={e => setPacks(ps => ps.map((p, i) => i === index ? { ...p, factor: e.target.value } : p))} placeholder="1" className="min-w-0 rounded-lg border border-slate-300 px-2 py-2 text-sm" />
                <input aria-label={`Barcode ${index + 1}`} value={pack.barcode} onChange={e => setPacks(ps => ps.map((p, i) => i === index ? { ...p, barcode: e.target.value } : p))} placeholder="Optional barcode" className="min-w-0 rounded-lg border border-slate-300 px-2 py-2 text-sm" />
                <button type="button" aria-label="Remove unit" onClick={() => setPacks(ps => ps.filter((_, i) => i !== index))} className="rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700">×</button>
              </div>)}
              <button type="button" onClick={() => setPacks(ps => [...ps, blankPack()])} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Add unit</button>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600">Cancel</button><button disabled={saving} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save configuration'}</button></div>
          </form>
        </div>
      </section>
    </div>
  );
}

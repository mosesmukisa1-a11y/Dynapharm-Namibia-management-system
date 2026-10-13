import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import MedicineSelection from './MedicineSelection';

/** Fresh catalogue identities only; never uses cached prices or invokes order/stock APIs. */
export default function HistoryMedicineSelection({ medicines, onToggle, disabled }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true); setError(''); setProducts([]);
    try {
      const catalogue = await api.prices.list();
      if (!Array.isArray(catalogue) || catalogue.some(p => !p || typeof p.description !== 'string' || !p.description.trim()))
        throw new Error('The current medicine catalogue returned an invalid response.');
      if (token === generation.current) {
        // Keep only identity/category: historical transcription has no pricing or BV data.
        setProducts(catalogue.map(p => ({ description: p.description, is_package: !!p.is_package })));
      }
    } catch (err) {
      if (token === generation.current) setError(err.message || 'Unable to load the current medicine catalogue.');
    } finally { if (token === generation.current) setLoading(false); }
  }, []);
  useEffect(() => { load(); return () => { generation.current++; }; }, [load]);
  const names = new Set(products.map(p => p.description));
  const selected = new Set(medicines.map(line => line.catalogueName || line.name).filter(name => names.has(name)));
  return <div>
    <p className="ch-caption">Select only medicines written on the original form. This records historical lines, not an order. If a medicine is absent from the current catalogue, use Add medicine to transcribe it manually.</p>
    {loading ? <div aria-label="Loading medicine catalogue" aria-busy="true"><div className="ch-skeleton" /></div>
      : error ? <div role="alert" className="ch-notice ch-error">{error} You can still transcribe historical medicines manually.
        <button type="button" className="ch-button secondary" disabled={disabled} onClick={load}>Retry catalogue</button></div>
        : <MedicineSelection products={products} medSearch={search} setMedSearch={setSearch} selectedMedicines={selected}
          toggleMedicine={onToggle} historical disabled={disabled} />}
  </div>;
}

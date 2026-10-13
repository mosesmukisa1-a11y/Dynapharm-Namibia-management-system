import { PACKAGE_DATABASE } from '../lib/pricing';
import './MedicineSelection.css';

/** Presentation only. Ordering, catalogue loading and mutation callbacks belong to the caller. */
export default function MedicineSelection({
  products, medSearch, setMedSearch, selectedMedicines, toggleMedicine,
  stockLoaded = false, branchInStock = new Set(), historical = false, disabled = false,
}) {
  // Preserve Consultant catalogue order, exact-name deduplication and package precedence.
  const seenPkg = new Set();
  const dedupPackages = products.filter(p => p.is_package && !seenPkg.has(p.description) && seenPkg.add(p.description));
  const pkgNames = new Set(dedupPackages.map(p => p.description));
  const seenProd = new Set();
  const dedupProducts = products.filter(p => !p.is_package && !pkgNames.has(p.description) && !seenProd.has(p.description) && seenProd.add(p.description));
  const medSearchLower = (medSearch || '').toLowerCase();
  const filteredPkgs = medSearchLower ? dedupPackages.filter(p => p.description.toLowerCase().includes(medSearchLower)) : dedupPackages;
  const filteredProds = medSearchLower ? dedupProducts.filter(p => p.description.toLowerCase().includes(medSearchLower)) : dedupProducts;
  const totalVisible = filteredPkgs.length + filteredProds.length;
  return <div className={historical ? 'medicine-selection-history' : ''} style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
      <h3 style={{ margin: 0, fontSize: '1rem', color: '#2c3e50' }}>{historical ? 'Medicine selection from current catalogue' : 'Prescription & Medicine Selection'}</h3>
      <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{totalVisible} products · {selectedMedicines.size} selected</span>
    </div>
    <input type="text" aria-label="Search products" placeholder="Search products…" value={medSearch} disabled={disabled}
      onChange={e => setMedSearch(e.target.value)}
      style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', marginBottom: '8px', boxSizing: 'border-box' }} />
    {!historical && stockLoaded && <div style={{ fontSize: '0.78rem', color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '5px 10px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span><strong>Red items</strong> are currently out of stock at your branch. You can still prescribe them — the branch will source stock before dispensing.</span>
    </div>}
    <div className="medicine-selection-grid">
      {filteredPkgs.map((pkg, idx) => {
        const staticEntry = PACKAGE_DATABASE[pkg.description];
        const isChecked = selectedMedicines.has(pkg.description);
        const isOos = !historical && stockLoaded && !branchInStock.has((pkg.description || '').trim().toLowerCase());
        const bg = isOos ? (isChecked ? '#fef3c7' : '#fee2e2') : (isChecked ? '#dcfce7' : '#e8f5e9');
        const borderColor = isOos ? (isChecked ? '#d97706' : '#dc2626') : (isChecked ? '#16a34a' : '#27ae60');
        return <div key={`pkg-${idx}`} className="medicine-selection-card" style={{ background: bg, borderLeft: `4px solid ${borderColor}`, padding: '10px', borderRadius: '6px', display: 'flex', alignItems: 'start', gap: '8px', cursor: 'pointer' }}
          onClick={() => { if (!disabled) toggleMedicine(pkg.description); }}>
          <input type="checkbox" aria-label={pkg.description} checked={isChecked} disabled={disabled} onChange={() => toggleMedicine(pkg.description)}
            style={{ marginTop: '3px', width: '16px', height: '16px', cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
          <div style={{ cursor: 'pointer', flex: 1 }}>
            <span style={{ fontWeight: 'bold', color: isOos ? (isChecked ? '#92400e' : '#991b1b') : '#166534' }}>{pkg.description}</span>
            {isOos && <span style={{ marginLeft: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: '#dc2626', borderRadius: '4px', padding: '1px 5px' }}>OUT OF STOCK</span>}
            <br /><small style={{ color: '#555' }}>{staticEntry ? `${staticEntry.products.length}-product bundle` : 'Bundle'}{!historical && <> · DP: N${pkg.dp} · CP: N${pkg.cp} · BV: {pkg.bv}</>}</small>
            {staticEntry && <><br /><small style={{ fontSize: '0.72rem', color: '#888' }}>Contains: {staticEntry.products.map(p => p.name).join(', ')}</small></>}
          </div>
        </div>;
      })}
      {filteredProds.map((product, idx) => {
        const isChecked = selectedMedicines.has(product.description);
        const isOos = !historical && stockLoaded && !branchInStock.has((product.description || '').trim().toLowerCase());
        const bg = isOos ? (isChecked ? '#fffbeb' : '#fff5f5') : (isChecked ? '#f0fdf4' : 'white');
        const borderColor = isOos ? (isChecked ? '#fcd34d' : '#fca5a5') : (isChecked ? '#86efac' : '#f0f0f0');
        const borderWidth = isOos ? '1.5px' : '1px';
        return <div key={`prod-${idx}`} className="medicine-selection-card" style={{ padding: '8px 10px', borderRadius: '6px', display: 'flex', alignItems: 'start', gap: '8px', border: `${borderWidth} solid ${borderColor}`, background: bg, cursor: 'pointer' }}
          onClick={() => { if (!disabled) toggleMedicine(product.description); }}>
          <input type="checkbox" aria-label={product.description} checked={isChecked} disabled={disabled} onChange={() => toggleMedicine(product.description)}
            style={{ marginTop: '3px', width: '16px', height: '16px', cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
          <div style={{ cursor: 'pointer', flex: 1 }}>
            <span style={{ fontWeight: isChecked ? 600 : 400, color: isOos ? (isChecked ? '#92400e' : '#991b1b') : (isChecked ? '#166534' : '#1e293b') }}>
              {product.description}
              {isOos && <span style={{ marginLeft: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: '#dc2626', borderRadius: '4px', padding: '1px 5px' }}>OUT OF STOCK</span>}
            </span>
            {!historical && <><br /><small style={{ color: '#666', fontSize: '0.82rem' }}>DP: N${product.dp} · CP: N${product.cp} · BV: {product.bv}</small></>}
          </div>
        </div>;
      })}
      {totalVisible === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '30px', color: '#9ca3af', fontSize: '0.9rem' }}>
        {products.length || !historical ? `No products match "${medSearch}"` : 'The current catalogue is empty. Transcribe historical medicines manually.'}
      </div>}
    </div>
    {selectedMedicines.size > 0 && <div className="medicine-selection-summary" style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #86efac' }}>
      <h4 style={{ margin: '0 0 8px', color: '#166534', fontSize: '0.9rem' }}>{historical ? 'Selected' : 'Prescribed'} ({selectedMedicines.size}):</h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {Array.from(selectedMedicines).map((med, i) => <span key={i} style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '3px 10px', borderRadius: '20px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          {med}<button type="button" aria-label={`Deselect ${med}`} disabled={disabled} onClick={() => toggleMedicine(med)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 700, fontSize: '0.9rem', padding: 0, lineHeight: 1 }}>×</button>
        </span>)}
      </div>
    </div>}
  </div>;
}

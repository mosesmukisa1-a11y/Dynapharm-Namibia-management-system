import React, { useState } from 'react';

export function ControlledStockFilters({ label, filters, onApply, locations, styles, operations = false }) {
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('');
  const statuses = operations
    ? ['draft','submitted','partially_reviewed','approved','partially_dispatched','dispatched','credited','rejected','cancelled']
    : ['saleable','expired','damaged','quarantine','out_of_stock'];
  return <div role="search" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end', marginBottom: 12 }}>
    <label style={{ flex: '1 1 220px' }}><span style={styles.label}>{label} search</span>
      <input style={styles.input} value={search} placeholder={operations ? 'Operation, reason, product or lot' : 'Product, lot, batch ID or location'}
        onChange={e => setSearch(e.target.value)} onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onApply({search,location,status,page:1}); }
        }} /></label>
    <label><span style={styles.label}>{label} location</span><select style={styles.input} value={location} onChange={e=>setLocation(e.target.value)}>
      <option value="">All permitted locations</option>{locations.map(value=><option key={value} value={value}>{value}</option>)}
    </select></label>
    <label><span style={styles.label}>{label} status</span><select style={styles.input} value={status} onChange={e=>setStatus(e.target.value)}>
      <option value="">All statuses</option>{statuses.map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}
    </select></label>
    <button type="button" style={styles.secondary} onClick={()=>onApply({search,location,status,page:1})}>Apply {label.toLowerCase()} filters</button>
    {(filters.search || filters.location || filters.status) && <button type="button" style={styles.secondary} onClick={()=>{
      setSearch('');setLocation('');setStatus('');onApply({search:'',location:'',status:'',page:1});
    }}>Reset {label.toLowerCase()} filters</button>}
  </div>;
}

export function ControlledStockPager({ label, pagination, onPage, disabled, styles }) {
  if (!pagination) return null;
  const {page,total,total_pages}=pagination;
  return <nav aria-label={`${label} pages`} style={{display:'flex',alignItems:'center',gap:10,margin:'12px 0',flexWrap:'wrap'}}>
    <button type="button" style={styles.secondary} disabled={disabled || page<=1} onClick={()=>onPage(page-1)}>Previous {label.toLowerCase()} page</button>
    <span style={styles.subdued}>{total} matching {label.toLowerCase()} · Page {page} of {Math.max(1,total_pages)}</span>
    <button type="button" style={styles.secondary} disabled={disabled || page>=total_pages} onClick={()=>onPage(page+1)}>Next {label.toLowerCase()} page</button>
  </nav>;
}

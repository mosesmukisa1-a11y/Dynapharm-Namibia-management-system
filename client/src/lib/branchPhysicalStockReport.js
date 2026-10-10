const escape=value=>String(value ?? '—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>`N$ ${Number(value).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export function buildBranchPhysicalStockReport(snapshot){
  if(!snapshot || !Array.isArray(snapshot.physical_inventory))throw Error('Physical stock snapshot is unavailable. Refresh before printing.');
  const stock=snapshot.physical_inventory;
  const sum=field=>stock.reduce((n,row)=>n+Number(row[field] || 0),0);
  for(const [rowField,summaryField] of [['quantity','closing_qty'],['available_qty','available_qty'],['quarantined_qty','quarantined_qty']]){
    if(Math.abs(sum(rowField)-Number(snapshot[summaryField] || 0))>1e-6)throw Error('Physical stock rows do not reconcile to the branch totals. Refresh before printing.');
  }
  const missing=stock.reduce((n,r)=>n+(r.unit_dp==null?Number(r.quantity):0),0);
  const total=stock.reduce((n,r)=>n+Number(r.dp_value || 0),0);
  const rows=stock.map(r=>`<tr>
    <td>${escape(r.product_name)}</td><td>${escape(r.batch_no)}</td>
    <td>${Number(r.quantity)}</td><td>${Number(r.available_qty)}</td>
    <td>${Number(r.reserved_qty)}</td><td>${Number(r.quarantined_qty)}</td>
    <td>${escape(r.condition)}</td><td>${r.unit_dp==null?'Unknown':money(r.unit_dp)}</td>
    <td>${r.unit_dp==null?'Unknown':money(r.dp_value)}</td><td>${escape(r.expiry_date)}</td>
  </tr>`).join('');
  return `<p>Current physical stock uses original received DP source layers, not today's catalogue. Owned stock includes held and reserved units; only available units can be sold.</p>
    <p><strong>Owned: ${sum('quantity')} · Available: ${sum('available_qty')} · Reserved: ${sum('reserved_qty')} · Quarantined: ${sum('quarantined_qty')}</strong></p>
    ${missing?`<p role="alert"><strong>Incomplete original DP evidence: ${missing} units. Values are known subtotals only.</strong></p>`:''}
    <table><thead><tr><th>Product</th><th>Batch</th><th>Owned</th><th>Available</th><th>Reserved</th><th>Quarantined</th><th>Condition</th><th>Original DP Unit</th><th>Original DP Value</th><th>Expiry</th></tr></thead>
    <tbody>${rows}<tr class="total-row"><td colspan="2"><strong>TOTALS</strong></td>
    <td><strong>${sum('quantity')}</strong></td><td>${sum('available_qty')}</td>
    <td>${sum('reserved_qty')}</td><td>${sum('quarantined_qty')}</td>
    <td colspan="2">${missing?'Known DP subtotal':'Original DP total'}</td><td><strong>${money(total)}</strong></td><td></td></tr></tbody></table>`;
}

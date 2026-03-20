import { COMPANY_INFO, BRANCH_DETAILS, formatCurrency } from './constants';

export function generateReceiptHTML({
  receiptNumber, branch, items, totalAmount, totalBV,
  paymentMethod, customerType, customerName, nbNumber,
  referralName, referralNB, cashier, showBV = true,
  branchProfit, distributorBV, copyType
}) {
  const branchInfo = BRANCH_DETAILS.find(b => b.name === branch) || {};
  const branchDisplay = branchInfo.name || branch || '';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const isMember = customerType === 'member';
  const isCustomerCopy = copyType === 'customer';
  const isStaffCopy = copyType === 'staff';
  const hideBV = isCustomerCopy || (!showBV);

  const itemRows = items.map(item => {
    const rawBV = Number(item.bv || item.lineBV || 0);
    const bvVal = isNaN(rawBV) ? 0 : rawBV;
    const bvDisplay = bvVal.toFixed(1);
    const profit = item.lineProfit != null ? item.lineProfit : null;
    return `
    <tr>
      <td style="padding:4px 8px;text-align:left;border-bottom:1px solid #eee;font-size:12px;">${item.product_name || item.name || item.description}</td>
      <td style="padding:4px 8px;text-align:center;border-bottom:1px solid #eee;font-size:12px;">${item.quantity || item.qty}</td>
      <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee;font-size:12px;">${formatCurrency(item.unit_price || item.unitPrice)}</td>
      <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee;font-size:12px;">${formatCurrency(item.line_total || item.lineTotal)}</td>
      ${!hideBV ? `<td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee;font-size:12px;">${bvDisplay}</td>` : ''}
      ${isStaffCopy && profit != null ? `<td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee;font-size:12px;color:#27ae60;font-weight:600;">${formatCurrency(profit)}</td>` : ''}
    </tr>`;
  }).join('');

  const referralRow = (!isMember && referralName)
    ? `<tr><td style="color:#888;">Referral:</td><td style="text-align:right;color:#e67e22;font-weight:bold;">${referralName}${referralNB ? ` (${referralNB})` : ''}</td></tr>`
    : '';
  const nbRow = nbNumber
    ? `<tr><td style="color:#888;">NB#:</td><td style="text-align:right;font-weight:bold;">${nbNumber}</td></tr>`
    : '';

  const copyBanner = copyType
    ? `<div style="text-align:center;margin-bottom:10px;padding:4px 12px;border-radius:20px;display:inline-block;background:${isCustomerCopy ? '#e8f5e9' : '#fff3cd'};color:${isCustomerCopy ? '#1a7041' : '#7d4e17'};font-size:11px;font-weight:700;letter-spacing:0.05em;border:1px solid ${isCustomerCopy ? '#a5d6a7' : '#f39c12'};">${isCustomerCopy ? '🧾 CUSTOMER COPY' : '📊 STAFF / DISTRIBUTOR COPY'}</div>`
    : '';

  const bvHeader = !hideBV ? '<th style="padding:6px 8px;text-align:right;font-size:11px;border-bottom:2px solid #ddd;">BV</th>' : '';
  const profitHeader = isStaffCopy && branchProfit != null ? '<th style="padding:6px 8px;text-align:right;font-size:11px;border-bottom:2px solid #ddd;color:#27ae60;">Profit</th>' : '';

  const profitSection = isStaffCopy && branchProfit != null ? `
    <div style="border-top:2px dashed #e2e8f0;margin-top:6px;padding-top:8px;">
      ${distributorBV != null && distributorBV > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#e67e22;font-weight:bold;margin-bottom:4px;"><span>Distributor BV Earned</span><span>${Number(distributorBV).toFixed(1)} BV</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;font-size:13px;color:#27ae60;font-weight:bold;padding:6px 10px;background:#f0fdf4;border-radius:6px;margin-top:4px;border:1px solid #bbf7d0;">
        <span>Branch Profit Earned</span><span>${formatCurrency(branchProfit)}</span>
      </div>
    </div>` : '';

  const bvLine = !hideBV && totalBV > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#e67e22;margin-top:4px;font-weight:bold;"><span>Total BV</span><span>${(isNaN(Number(totalBV)) ? 0 : Number(totalBV)).toFixed(1)}</span></div>` : '';

  return `
    <div style="max-width:400px;margin:0 auto;font-family:Arial,sans-serif;color:#333;">
      <div style="text-align:center;padding:16px 0;border-bottom:2px solid #c41e3a;">
        <img src="${COMPANY_INFO.logo}" alt="Dynapharm" style="height:60px;margin-bottom:8px;" onerror="this.style.display='none'" />
        <h2 style="margin:0;color:#c41e3a;font-size:16px;">${COMPANY_INFO.name}</h2>
        <p style="margin:2px 0;font-size:11px;color:#666;">${COMPANY_INFO.tagline}</p>
        ${branchDisplay ? `<p style="margin:4px 0 0;font-size:12px;color:#555;font-weight:bold;">${branchDisplay} Branch</p>` : ''}
        ${branchInfo.address ? `<p style="margin:2px 0;font-size:10px;color:#777;">${branchInfo.address}</p>` : ''}
        ${branchInfo.phone ? `<p style="margin:2px 0;font-size:10px;color:#777;">Tel: ${branchInfo.phone}</p>` : ''}
        <div style="margin-top:8px;">${copyBanner}</div>
      </div>
      <div style="padding:12px 0;border-bottom:1px dashed #ccc;">
        <table style="width:100%;font-size:11px;">
          <tr><td style="color:#888;">Receipt #:</td><td style="text-align:right;font-weight:bold;">${receiptNumber}</td></tr>
          <tr><td style="color:#888;">Date:</td><td style="text-align:right;">${dateStr}</td></tr>
          <tr><td style="color:#888;">Time:</td><td style="text-align:right;">${timeStr}</td></tr>
          ${customerName ? `<tr><td style="color:#888;">Customer:</td><td style="text-align:right;">${customerName}</td></tr>` : ''}
          ${nbRow}
          <tr><td style="color:#888;">Type:</td><td style="text-align:right;">${isMember ? 'Member (DP Price)' : 'Non-Member (CP Price)'}</td></tr>
          ${referralRow}
          <tr><td style="color:#888;">Payment:</td><td style="text-align:right;">${paymentMethod}</td></tr>
          ${cashier ? `<tr><td style="color:#888;">Cashier:</td><td style="text-align:right;">${cashier}</td></tr>` : ''}
        </table>
      </div>
      <div style="padding:12px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:6px 8px;text-align:left;font-size:11px;border-bottom:2px solid #ddd;">Item</th>
              <th style="padding:6px 8px;text-align:center;font-size:11px;border-bottom:2px solid #ddd;">Qty</th>
              <th style="padding:6px 8px;text-align:right;font-size:11px;border-bottom:2px solid #ddd;">Price</th>
              <th style="padding:6px 8px;text-align:right;font-size:11px;border-bottom:2px solid #ddd;">Total</th>
              ${bvHeader}
              ${profitHeader}
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
      <div style="border-top:2px solid #333;padding:12px 0;">
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:bold;">
          <span>TOTAL</span>
          <span style="color:#c41e3a;">${formatCurrency(totalAmount)}</span>
        </div>
        ${bvLine}
        ${profitSection}
      </div>
      <div style="text-align:center;padding:16px 0;border-top:1px dashed #ccc;font-size:10px;color:#999;">
        <p style="margin:0;">Thank you for shopping with Dynapharm!</p>
        <p style="margin:4px 0;">${COMPANY_INFO.tagline}</p>
        <p style="margin:4px 0;">Facebook: ${COMPANY_INFO.socialMedia.facebook.replace('https://www.facebook.com/', '@')}</p>
        <p style="margin:4px 0;">WhatsApp: ${COMPANY_INFO.socialMedia.whatsapp}</p>
      </div>
    </div>
  `;
}

export function printReceipt(receiptHTML) {
  const printWindow = window.open('', '_blank', 'width=450,height=700');
  if (!printWindow) return;
  printWindow.document.write(`
    <!DOCTYPE html>
    <html><head><title>Receipt</title>
    <style>
      @media print { body { margin: 0; } @page { size: 80mm auto; margin: 5mm; } }
      body { margin: 20px; }
    </style>
    </head><body>${receiptHTML}
    <script>window.onload = function() { window.print(); }<\/script>
    </body></html>
  `);
  printWindow.document.close();
}

export function generateSalesPDFHTML({
  receiptNumber, branch, items, totalAmount, totalBV,
  paymentMethod, customerType, customerName, nbNumber,
  referralName, referralNB, cashier, showBV = true,
  branchProfit, distributorBV, copyType, saleDate
}) {
  const branchInfo = BRANCH_DETAILS.find(b => b.name === branch) || {};
  const branchDisplay = branchInfo.name || branch || '';
  const now = saleDate ? new Date(saleDate) : new Date();
  const dateStr = now.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  const isMember = customerType === 'member';
  const isCustomerCopy = copyType === 'customer';
  const isStaffCopy = copyType === 'staff';
  const hideBV = isCustomerCopy || (!showBV);

  const copyLabel = copyType ? (isCustomerCopy ? 'CUSTOMER COPY' : 'STAFF / DISTRIBUTOR COPY') : 'SALES INVOICE';
  const copyColor = isCustomerCopy ? '#166534' : isStaffCopy ? '#7d4e17' : '#c41e3a';
  const copyBg = isCustomerCopy ? '#dcfce7' : isStaffCopy ? '#fef3c7' : '#fff0f3';

  const itemRows = items.map(item => {
    const rawBV = Number(item.bv || item.lineBV || 0);
    const bvVal = isNaN(rawBV) ? 0 : rawBV;
    const profit = item.lineProfit != null ? item.lineProfit : null;
    return `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:9px 10px;">${item.product_name || item.name || item.description || '—'}</td>
      <td style="padding:9px 10px;text-align:center;">${item.quantity || item.qty || 1}</td>
      <td style="padding:9px 10px;text-align:right;">${formatCurrency(item.unit_price || item.unitPrice || 0)}</td>
      <td style="padding:9px 10px;text-align:right;font-weight:600;">${formatCurrency(item.line_total || item.lineTotal || 0)}</td>
      ${!hideBV ? `<td style="padding:9px 10px;text-align:right;color:#e67e22;">${bvVal.toFixed(1)}</td>` : ''}
      ${isStaffCopy && profit != null ? `<td style="padding:9px 10px;text-align:right;color:#16a34a;font-weight:600;">${formatCurrency(profit)}</td>` : ''}
    </tr>`;
  }).join('');

  const bvHeader = !hideBV ? '<th style="padding:9px 10px;text-align:right;color:white;">BV</th>' : '';
  const profitHeader = isStaffCopy && branchProfit != null ? '<th style="padding:9px 10px;text-align:right;color:#86efac;">Profit</th>' : '';

  const totalBVDisplay = !hideBV && totalBV > 0
    ? `<tr style="background:#fffbeb;"><td colspan="${2 + (hideBV ? 0 : 0)}" style="padding:8px 10px;"></td><td style="padding:8px 10px;text-align:right;color:#b45309;font-weight:600;">Total BV</td><td style="padding:8px 10px;text-align:right;font-weight:700;color:#e67e22;">${(isNaN(Number(totalBV)) ? 0 : Number(totalBV)).toFixed(1)}</td>${!hideBV ? '' : ''}</tr>`
    : '';

  const profitRow = isStaffCopy && branchProfit != null
    ? `<div style="margin-top:12px;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
        ${distributorBV != null && distributorBV > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#e67e22;margin-bottom:6px;font-weight:600;"><span>Distributor BV Earned</span><span>${Number(distributorBV).toFixed(1)} BV</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;color:#16a34a;"><span>Branch Profit Earned</span><span>${formatCurrency(branchProfit)}</span></div>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html><head><title>Sales Invoice - ${receiptNumber}</title>
<style>
  @media print { body { margin:0; } @page { size:A4; margin:15mm; } .no-print{display:none;} }
  * { box-sizing:border-box; }
  body { font-family:Arial,sans-serif; font-size:12px; color:#1e293b; margin:20px; line-height:1.5; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #c41e3a; padding-bottom:16px; margin-bottom:20px; }
  .logo { height:60px; }
  .co-name { color:#c41e3a; font-size:20px; font-weight:bold; margin:0 0 2px; }
  .co-tag { color:#64748b; font-size:11px; margin:0; }
  .branch-name { font-size:13px; font-weight:700; color:#1e3a5f; margin-top:4px; }
  .branch-addr { font-size:10px; color:#64748b; margin:2px 0 0; }
  .invoice-label { font-size:11px; font-weight:700; letter-spacing:.12em; padding:4px 14px; border-radius:20px; background:${copyBg}; color:${copyColor}; border:1.5px solid ${copyColor}44; display:inline-block; }
  .invoice-num { font-size:22px; font-weight:900; color:#1e293b; margin:4px 0 0; }
  .meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px; margin-bottom:18px; }
  .meta-label { font-size:10px; color:#94a3b8; font-weight:600; text-transform:uppercase; letter-spacing:.05em; }
  .meta-value { font-size:12px; font-weight:600; color:#1e293b; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; }
  thead tr { background:#1e3a5f; }
  thead th { color:white; padding:9px 10px; text-align:left; font-size:11px; font-weight:600; letter-spacing:.04em; }
  tbody tr:nth-child(even) { background:#f8fafc; }
  tfoot tr { background:#f1f5f9; font-weight:700; }
  tfoot td { padding:9px 10px; }
  .total-box { background:#0f172a; color:white; padding:14px 18px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
  .total-label { font-size:14px; color:rgba(255,255,255,0.7); }
  .total-amount { font-size:24px; font-weight:900; color:#4ade80; }
  .footer { margin-top:30px; border-top:1px dashed #e2e8f0; padding-top:14px; text-align:center; font-size:10px; color:#94a3b8; }
  .print-btn { background:#1e3a5f; color:white; border:none; padding:10px 22px; border-radius:8px; font-size:13px; cursor:pointer; margin-bottom:14px; }
</style>
</head><body>
<button class="no-print print-btn" onclick="window.print()">🖨️ Print PDF</button>

<div class="header">
  <div>
    <img class="logo" src="${COMPANY_INFO.logo}" onerror="this.style.display='none'" />
    <div class="co-name">${COMPANY_INFO.name}</div>
    <div class="co-tag">${COMPANY_INFO.tagline}</div>
    ${branchDisplay ? `<div class="branch-name">${branchDisplay} Branch</div>` : ''}
    ${branchInfo.address ? `<div class="branch-addr">${branchInfo.address}</div>` : ''}
    ${branchInfo.phone ? `<div class="branch-addr">Tel: ${branchInfo.phone}</div>` : ''}
  </div>
  <div style="text-align:right;">
    <div class="invoice-label">${copyLabel}</div>
    <div class="invoice-num">${receiptNumber}</div>
    <div style="font-size:12px;color:#64748b;margin-top:4px;">${dateStr}</div>
    <div style="font-size:11px;color:#94a3b8;">${timeStr}</div>
  </div>
</div>

<div class="meta-grid">
  <div><div class="meta-label">Customer</div><div class="meta-value">${customerName || '—'}</div></div>
  <div><div class="meta-label">Customer Type</div><div class="meta-value">${isMember ? '🏅 Member (DP Price)' : '👤 Non-Member (CP Price)'}</div></div>
  ${nbNumber ? `<div><div class="meta-label">NB Number</div><div class="meta-value">${nbNumber}</div></div>` : ''}
  ${!isMember && referralName ? `<div><div class="meta-label">Referral Distributor</div><div class="meta-value">${referralName}${referralNB ? ` (${referralNB})` : ''}</div></div>` : ''}
  <div><div class="meta-label">Payment Method</div><div class="meta-value">${paymentMethod || '—'}</div></div>
  ${cashier ? `<div><div class="meta-label">Served By</div><div class="meta-value">${cashier}</div></div>` : ''}
</div>

<table>
  <thead><tr>
    <th>Item Description</th>
    <th style="text-align:center;">Qty</th>
    <th style="text-align:right;">Unit Price</th>
    <th style="text-align:right;">Line Total</th>
    ${bvHeader}
    ${profitHeader}
  </tr></thead>
  <tbody>${itemRows}</tbody>
  <tfoot>
    <tr>
      <td colspan="${2 + (!hideBV ? 1 : 0) + (isStaffCopy && branchProfit != null ? 1 : 0)}" style="text-align:right;color:#64748b;">Subtotal</td>
      <td style="text-align:right;">${formatCurrency(totalAmount)}</td>
      ${!hideBV && totalBV > 0 ? `<td style="text-align:right;color:#e67e22;">${(isNaN(Number(totalBV)) ? 0 : Number(totalBV)).toFixed(1)} BV</td>` : ''}
    </tr>
  </tfoot>
</table>

<div class="total-box">
  <div class="total-label">GRAND TOTAL</div>
  <div class="total-amount">${formatCurrency(totalAmount)}</div>
</div>

${profitRow}

<div class="footer">
  <p style="margin:0;font-size:11px;font-weight:600;color:#374151;">Thank you for shopping with Dynapharm International Namibia!</p>
  <p style="margin:4px 0;">${COMPANY_INFO.tagline}</p>
  <p style="margin:2px 0;">Facebook: ${COMPANY_INFO.socialMedia.facebook.replace('https://www.facebook.com/', '@')} &nbsp;|&nbsp; WhatsApp: ${COMPANY_INFO.socialMedia.whatsapp}</p>
</div>
</body></html>`;
}

export function printSalesPDF(params) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(generateSalesPDFHTML(params));
  w.document.close();
}

export const SYMPTOM_PRODUCT_MAP = {
  'Headache': ['Dyna Ginseng Coffee', 'Dyna Spirulina 500 Tablets', 'Dyna Green Tea'],
  'Fatigue / Low Energy': ['Dyna Ginseng Coffee', 'Dyna Spirulina 500 Tablets', 'Dyna Cordyceps Capsule', 'Dyna Bee Pollen'],
  'Joint Pain': ['Dyna Glucosamine Capsule', 'Dyna Tiger Balm', 'Dyna Omega-3 Softgel'],
  'Digestive Issues': ['Dyna Enzyme', 'Dyna Fiber', 'Dyna Probiotics'],
  'Weak Immune System': ['Dyna Spirulina 500 Tablets', 'Dyna Garlic Oil Softgel', 'Dyna Vitamin C'],
  'Skin Problems': ['Dyna Collagen Plus', 'Dyna Aloe Vera Gel', 'Dyna Vitamin E Softgel'],
  'High Blood Pressure': ['Dyna Garlic Oil Softgel', 'Dyna Omega-3 Softgel', 'Dyna Green Tea'],
  'Diabetes / Blood Sugar': ['Dyna Spirulina 500 Tablets', 'Dyna Bitter Gourd Capsule', 'Dyna Fiber'],
  'Weight Management': ['Dyna Fiber', 'Dyna Green Tea', 'Dyna Enzyme', 'Dyna Spirulina 500 Tablets'],
  'Respiratory Issues': ['Dyna Cordyceps Capsule', 'Dyna Garlic Oil Softgel', 'Dyna Propolis'],
  'Poor Sleep': ['Dyna Spirulina 500 Tablets', 'Dyna Cordyceps Capsule'],
  'Eye Problems': ['Dyna Blueberry Lutein', 'Dyna Spirulina 500 Tablets'],
  'Kidney / Urinary': ['Dyna Kidney Tonic', 'Dyna Green Tea', 'Dyna Spirulina 500 Tablets'],
  'Liver Issues': ['Dyna Liver Guard', 'Dyna Spirulina 500 Tablets', 'Dyna Green Tea'],
  'Reproductive Health': ['Dyna Tongkat Ali', 'Dyna Cordyceps Capsule', 'Dyna Bee Pollen'],
  'Hair Loss': ['Dyna Collagen Plus', 'Dyna Spirulina 500 Tablets', 'Dyna Biotin'],
  'Bone Health': ['Dyna Glucosamine Capsule', 'Dyna Calcium + Vitamin D'],
  'Cholesterol': ['Dyna Omega-3 Softgel', 'Dyna Garlic Oil Softgel', 'Dyna Green Tea'],
  'Stress / Anxiety': ['Dyna Ginseng Coffee', 'Dyna Spirulina 500 Tablets', 'Dyna Cordyceps Capsule'],
  'Allergies': ['Dyna Propolis', 'Dyna Spirulina 500 Tablets', 'Dyna Garlic Oil Softgel'],
};

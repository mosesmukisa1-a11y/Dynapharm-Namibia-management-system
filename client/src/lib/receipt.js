import { COMPANY_INFO, BRANCH_DETAILS, formatCurrency } from './constants';

/* ────────────────────────────────────────────────────────────────
   THERMAL RECEIPT  (80mm roll)
   For MEMBERS:   simple — price (DP), BV, total
   For NON-MEMBERS: comprehensive — CP, DP, BV, profit, referral,
                    branch amount, N$50 cashback
─────────────────────────────────────────────────────────────────*/
export function generateReceiptHTML({
  receiptNumber, branch, items, totalAmount, totalBV,
  paymentMethod, customerType, customerName, nbNumber,
  referralName, referralNB, cashier, showBV = true,
  cashback = 0, branchAmount = null, distributorProfit = null,
  consultFeeAmount = 0, consultFeeMode = null,
}) {
  const branchInfo = BRANCH_DETAILS.find(b => b.name === branch) || {};
  const branchDisplay = branchInfo.name || branch || '';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const isMember = customerType === 'member';
  const isNonMember = !isMember;

  const nbRow = nbNumber ? `<tr><td style="color:#888;">NB#:</td><td style="text-align:right;font-weight:bold;">${nbNumber}</td></tr>` : '';
  const referralRow = isNonMember ? `<tr><td style="color:#888;">Referral:</td><td style="text-align:right;color:#e67e22;font-weight:bold;">${referralName || 'Dynapharm Namibia'}${referralNB ? ` (${referralNB})` : referralName ? '' : ' (NB005676)'}</td></tr>` : '';

  /* ── Member receipt: simple — Price(DP), BV, Total ── */
  if (isMember) {
    const memberRows = items.map(item => {
      const bv = Number(item.bv || item.lineBV || 0);
      return `<tr>
        <td style="padding:3px 6px;font-size:11px;border-bottom:1px solid #f0f0f0;">${item.product_name || item.name || item.description}</td>
        <td style="padding:3px 6px;text-align:center;font-size:11px;border-bottom:1px solid #f0f0f0;">${item.quantity || item.qty || 1}</td>
        <td style="padding:3px 6px;text-align:right;font-size:11px;border-bottom:1px solid #f0f0f0;">${formatCurrency(item.unit_price || item.unitPrice)}</td>
        ${showBV ? `<td style="padding:3px 6px;text-align:right;font-size:11px;border-bottom:1px solid #f0f0f0;color:#e67e22;">${bv > 0 ? bv.toFixed(1) : '—'}</td>` : ''}
        <td style="padding:3px 6px;text-align:right;font-size:11px;border-bottom:1px solid #f0f0f0;font-weight:600;">${formatCurrency(item.line_total || item.lineTotal)}</td>
      </tr>`;
    }).join('');
    const bvLine = showBV && totalBV > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#e67e22;margin-top:4px;font-weight:bold;"><span>BV Earned</span><span>${Number(totalBV).toFixed(1)} BV</span></div>` : '';
    const consultLine = consultFeeAmount > 0 ? `<div style="margin-top:6px;padding:5px 8px;border-radius:5px;background:#fffbeb;border:1px solid #fcd34d;font-size:10px;color:#92400e;">💼 Consult Fee: <strong>N$${consultFeeAmount}</strong> — ${consultFeeMode === 'inclusive' ? 'Inclusive (not in branch sales)' : 'Billed separately (not in branch sales)'}</div>` : '';

    return `
      <div style="max-width:400px;margin:0 auto;font-family:Arial,sans-serif;color:#333;">
        ${_header(COMPANY_INFO, branchDisplay, branchInfo)}
        <div style="padding:10px 0;border-bottom:1px dashed #ccc;">
          <table style="width:100%;font-size:11px;">
            <tr><td style="color:#888;">Receipt #:</td><td style="text-align:right;font-weight:bold;">${receiptNumber}</td></tr>
            <tr><td style="color:#888;">Date:</td><td style="text-align:right;">${dateStr} ${timeStr}</td></tr>
            ${customerName ? `<tr><td style="color:#888;">Member:</td><td style="text-align:right;font-weight:bold;">${customerName}</td></tr>` : ''}
            ${nbRow}
            <tr><td style="color:#888;">Payment:</td><td style="text-align:right;">${paymentMethod || ''}</td></tr>
            ${cashier ? `<tr><td style="color:#888;">Cashier:</td><td style="text-align:right;">${cashier}</td></tr>` : ''}
          </table>
        </div>
        <div style="padding:10px 0;">
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:#f5f5f5;">
              <th style="padding:5px 6px;text-align:left;font-size:10px;border-bottom:2px solid #ddd;">Item</th>
              <th style="padding:5px 6px;text-align:center;font-size:10px;border-bottom:2px solid #ddd;">Qty</th>
              <th style="padding:5px 6px;text-align:right;font-size:10px;border-bottom:2px solid #ddd;">Price(DP)</th>
              ${showBV ? '<th style="padding:5px 6px;text-align:right;font-size:10px;border-bottom:2px solid #ddd;color:#e67e22;">BV</th>' : ''}
              <th style="padding:5px 6px;text-align:right;font-size:10px;border-bottom:2px solid #ddd;">Total</th>
            </tr></thead>
            <tbody>${memberRows}</tbody>
          </table>
        </div>
        <div style="border-top:2px solid #333;padding:10px 0;">
          <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:bold;">
            <span>TOTAL</span><span style="color:#c41e3a;">${formatCurrency(totalAmount)}</span>
          </div>
          ${bvLine}
          ${consultLine}
        </div>
        ${_footer(COMPANY_INFO)}
      </div>`;
  }

  /* ── Non-member: TWO slips — customer copy then branch copy ── */
  const calcBranchAmt = branchAmount != null ? branchAmount : items.reduce((s, it) => s + ((it.dpPrice || 0) * (it.quantity || it.qty || 1)), 0);
  const calcDistProfit = distributorProfit != null ? distributorProfit : (totalAmount - calcBranchAmt);
  const bvEarned = Number(totalBV || 0);
  const consultLine2 = consultFeeAmount > 0 ? `<div style="margin-top:5px;padding:4px 7px;border-radius:4px;background:#fffbeb;border:1px solid #fcd34d;font-size:9px;color:#92400e;">💼 Consult Fee: N$${consultFeeAmount} — ${consultFeeMode === 'inclusive' ? 'Inclusive' : 'Billed separately'}</div>` : '';

  /* ── SLIP 1: Customer copy — clean, CP prices only ── */
  const custRows = items.map(item => {
    const qty = Number(item.quantity || item.qty || 1);
    const cp = item.cpPrice != null ? item.cpPrice : (item.unit_price || item.unitPrice || 0);
    const lineTotal = item.line_total || item.lineTotal || cp * qty;
    return `<tr>
      <td style="padding:3px 6px;font-size:11px;border-bottom:1px solid #f0f0f0;">${item.product_name || item.name || item.description}</td>
      <td style="padding:3px 6px;text-align:center;font-size:11px;border-bottom:1px solid #f0f0f0;">${qty}</td>
      <td style="padding:3px 6px;text-align:right;font-size:11px;border-bottom:1px solid #f0f0f0;">${formatCurrency(cp)}</td>
      <td style="padding:3px 6px;text-align:right;font-size:11px;border-bottom:1px solid #f0f0f0;font-weight:600;">${formatCurrency(lineTotal)}</td>
    </tr>`;
  }).join('');

  const customerSlip = `
    <div style="max-width:400px;margin:0 auto;font-family:Arial,sans-serif;color:#333;">
      ${_header(COMPANY_INFO, branchDisplay, branchInfo)}
      <div style="text-align:center;margin:4px 0;padding:3px 0;border-top:1px dashed #c41e3a;border-bottom:1px dashed #c41e3a;">
        <span style="font-size:11px;font-weight:900;color:#c41e3a;letter-spacing:2px;">— CUSTOMER COPY —</span>
      </div>
      <div style="padding:8px 0;border-bottom:1px dashed #ccc;">
        <table style="width:100%;font-size:11px;">
          <tr><td style="color:#888;">Receipt #:</td><td style="text-align:right;font-weight:bold;">${receiptNumber}</td></tr>
          <tr><td style="color:#888;">Date:</td><td style="text-align:right;">${dateStr} ${timeStr}</td></tr>
          ${customerName ? `<tr><td style="color:#888;">Customer:</td><td style="text-align:right;font-weight:bold;">${customerName}</td></tr>` : ''}
          ${referralRow}
          <tr><td style="color:#888;">Payment:</td><td style="text-align:right;">${paymentMethod || ''}</td></tr>
          ${cashier ? `<tr><td style="color:#888;">Cashier:</td><td style="text-align:right;">${cashier}</td></tr>` : ''}
        </table>
      </div>
      <div style="padding:8px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:#f5f5f5;">
            <th style="padding:4px 6px;text-align:left;font-size:10px;border-bottom:2px solid #ddd;">Item</th>
            <th style="padding:4px 6px;text-align:center;font-size:10px;border-bottom:2px solid #ddd;">Qty</th>
            <th style="padding:4px 6px;text-align:right;font-size:10px;border-bottom:2px solid #ddd;">Price</th>
            <th style="padding:4px 6px;text-align:right;font-size:10px;border-bottom:2px solid #ddd;">Total</th>
          </tr></thead>
          <tbody>${custRows}</tbody>
        </table>
      </div>
      <div style="border-top:2px solid #333;padding:8px 0;">
        <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:bold;">
          <span>TOTAL</span><span style="color:#c41e3a;">${formatCurrency(totalAmount)}</span>
        </div>
        ${cashback > 0 ? `<div style="margin-top:6px;padding:7px;border-radius:6px;background:#fef3c7;border:1.5px solid #f59e0b;text-align:center;"><div style="font-size:12px;font-weight:900;color:#92400e;">🎁 N$${cashback} CASHBACK</div></div>` : ''}
        ${consultLine2}
      </div>
      ${_footer(COMPANY_INFO)}
    </div>`;

  /* ── SLIP 2: Branch/distributor copy — full internal breakdown ── */
  const branchRows = items.map(item => {
    const bv = Number(item.bv || item.lineBV || 0);
    const qty = Number(item.quantity || item.qty || 1);
    const cp = item.cpPrice != null ? item.cpPrice : (item.unit_price || item.unitPrice || 0);
    const dp = item.dpPrice != null ? item.dpPrice : 0;
    const profit = (cp - dp) * qty;
    return `<tr>
      <td style="padding:3px 5px;font-size:10px;border-bottom:1px solid #f0f0f0;">${item.product_name || item.name || item.description}</td>
      <td style="padding:3px 5px;text-align:center;font-size:10px;border-bottom:1px solid #f0f0f0;">${qty}</td>
      <td style="padding:3px 5px;text-align:right;font-size:10px;border-bottom:1px solid #f0f0f0;">${formatCurrency(cp)}</td>
      <td style="padding:3px 5px;text-align:right;font-size:10px;border-bottom:1px solid #f0f0f0;color:#1e40af;">${formatCurrency(dp)}</td>
      <td style="padding:3px 5px;text-align:right;font-size:10px;border-bottom:1px solid #f0f0f0;color:#e67e22;">${bv > 0 ? bv.toFixed(1) : '—'}</td>
      <td style="padding:3px 5px;text-align:right;font-size:10px;border-bottom:1px solid #f0f0f0;color:#16a34a;font-weight:600;">${formatCurrency(profit)}</td>
    </tr>`;
  }).join('');

  const branchSlip = `
    <div style="max-width:400px;margin:0 auto;font-family:Arial,sans-serif;color:#333;">
      ${_header(COMPANY_INFO, branchDisplay, branchInfo)}
      <div style="text-align:center;margin:4px 0;padding:3px 0;border-top:1px dashed #1e3a5f;border-bottom:1px dashed #1e3a5f;">
        <span style="font-size:11px;font-weight:900;color:#1e3a5f;letter-spacing:2px;">— BRANCH COPY —</span>
      </div>
      <div style="padding:8px 0;border-bottom:1px dashed #ccc;">
        <table style="width:100%;font-size:11px;">
          <tr><td style="color:#888;">Receipt #:</td><td style="text-align:right;font-weight:bold;">${receiptNumber}</td></tr>
          <tr><td style="color:#888;">Date:</td><td style="text-align:right;">${dateStr} ${timeStr}</td></tr>
          ${customerName ? `<tr><td style="color:#888;">Customer:</td><td style="text-align:right;font-weight:bold;">${customerName}</td></tr>` : ''}
          <tr><td style="color:#888;">Type:</td><td style="text-align:right;">Non-Member (CP Price)</td></tr>
          ${referralRow}
          <tr><td style="color:#888;">Payment:</td><td style="text-align:right;">${paymentMethod || ''}</td></tr>
          ${cashier ? `<tr><td style="color:#888;">Cashier:</td><td style="text-align:right;">${cashier}</td></tr>` : ''}
        </table>
      </div>
      <div style="padding:8px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:#1e3a5f;">
            <th style="padding:4px 5px;text-align:left;font-size:9px;color:white;">Item</th>
            <th style="padding:4px 5px;text-align:center;font-size:9px;color:white;">Qty</th>
            <th style="padding:4px 5px;text-align:right;font-size:9px;color:white;">CP</th>
            <th style="padding:4px 5px;text-align:right;font-size:9px;color:#93c5fd;">DP</th>
            <th style="padding:4px 5px;text-align:right;font-size:9px;color:#fde68a;">BV</th>
            <th style="padding:4px 5px;text-align:right;font-size:9px;color:#86efac;">Profit</th>
          </tr></thead>
          <tbody>${branchRows}</tbody>
        </table>
      </div>
      <div style="border-top:2px solid #333;padding:8px 0;">
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:bold;">
          <span>Customer Total (CP)</span><span style="color:#c41e3a;">${formatCurrency(totalAmount)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:3px;">
          <span style="color:#1e40af;">Branch Amount (DP)</span><span style="color:#1e40af;font-weight:bold;">${formatCurrency(calcBranchAmt)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:3px;padding:3px 6px;background:#f0fdf4;border-radius:4px;border:1px solid #bbf7d0;">
          <span style="color:#16a34a;">Distributor Profit (CP−DP)</span><span style="color:#16a34a;font-weight:bold;">${formatCurrency(calcDistProfit)}</span>
        </div>
        ${bvEarned > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px;color:#e67e22;margin-top:3px;"><span>BV Earned</span><span>${bvEarned.toFixed(1)} BV</span></div>` : ''}
        <div style="font-size:9px;color:#94a3b8;margin-top:3px;font-style:italic;">* Distributor profit is off branch books</div>
        ${consultLine2}
      </div>
      ${_footer(COMPANY_INFO)}
    </div>`;

  return `${customerSlip}<div style="page-break-after:always;"></div>${branchSlip}`;
}

/* ────────────────────────────────────────────────────────────────
   PRESCRIPTION QUOTE  (thermal format)
   Member → DP price only + consult fee
   Non-member → CP price only + consult fee
─────────────────────────────────────────────────────────────────*/
export function generatePrescriptionQuoteHTML({
  rxId, branch, patientName, membershipStatus, consultantName,
  items, consultFeeTotal, consultFeeLabel, consultMode, date,
}) {
  const branchInfo = BRANCH_DETAILS.find(b => b.name === branch) || {};
  const branchDisplay = branchInfo.name || branch || '';
  const isMember = membershipStatus === 'member';
  const dateStr = date ? new Date(date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }) : new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });

  const itemRows = items.map(item => {
    const bv = Number(item.bv || 0);
    return `<tr>
      <td style="padding:3px 6px;font-size:11px;border-bottom:1px solid #f0f0f0;">${item.name}</td>
      <td style="padding:3px 6px;text-align:center;font-size:11px;border-bottom:1px solid #f0f0f0;">1</td>
      <td style="padding:3px 6px;text-align:right;font-size:11px;border-bottom:1px solid #f0f0f0;font-weight:600;">${formatCurrency(isMember ? item.dp : item.cp)}</td>
      ${isMember ? `<td style="padding:3px 6px;text-align:right;font-size:11px;border-bottom:1px solid #f0f0f0;color:#e67e22;">${bv > 0 ? bv.toFixed(1) : '—'}</td>` : ''}
    </tr>`;
  }).join('');

  const medTotal = items.reduce((s, m) => s + (isMember ? m.dp : m.cp), 0);
  const totalBV = items.reduce((s, m) => s + (m.bv || 0), 0);
  const isInclusive = consultMode === 'inclusive';
  const grandTotal = medTotal + (isInclusive ? (consultFeeTotal || 0) : 0);

  return `
    <div style="max-width:400px;margin:0 auto;font-family:Arial,sans-serif;color:#333;">
      ${_header(COMPANY_INFO, branchDisplay, branchInfo)}
      <div style="text-align:center;margin:8px 0;padding:4px 0;border-top:1px dashed #c41e3a;border-bottom:1px dashed #c41e3a;">
        <span style="font-size:13px;font-weight:900;color:#c41e3a;letter-spacing:2px;">PRESCRIPTION QUOTE</span>
      </div>
      <div style="padding:8px 0;border-bottom:1px dashed #ccc;">
        <table style="width:100%;font-size:11px;">
          <tr><td style="color:#888;">Rx #:</td><td style="text-align:right;font-weight:bold;">${rxId}</td></tr>
          <tr><td style="color:#888;">Date:</td><td style="text-align:right;">${dateStr}</td></tr>
          <tr><td style="color:#888;">Patient:</td><td style="text-align:right;font-weight:bold;">${patientName || '—'}</td></tr>
          <tr><td style="color:#888;">Type:</td><td style="text-align:right;font-weight:bold;">${isMember ? '🏅 Member (DP Price)' : '👤 Non-Member (CP Price)'}</td></tr>
          ${consultantName ? `<tr><td style="color:#888;">Consultant:</td><td style="text-align:right;">${consultantName}</td></tr>` : ''}
        </table>
      </div>
      <div style="padding:8px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:#f5f5f5;">
            <th style="padding:5px 6px;text-align:left;font-size:10px;border-bottom:2px solid #ddd;">Item</th>
            <th style="padding:5px 6px;text-align:center;font-size:10px;border-bottom:2px solid #ddd;">Qty</th>
            <th style="padding:5px 6px;text-align:right;font-size:10px;border-bottom:2px solid #ddd;">${isMember ? 'DP Price' : 'CP Price'}</th>
            ${isMember ? '<th style="padding:5px 6px;text-align:right;font-size:10px;border-bottom:2px solid #ddd;color:#e67e22;">BV</th>' : ''}
          </tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
      <div style="border-top:2px solid #333;padding:10px 0;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
          <span style="color:#666;">Medicines Subtotal</span><span style="font-weight:600;">${formatCurrency(medTotal)}</span>
        </div>
        ${isMember && totalBV > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px;color:#e67e22;margin-bottom:3px;"><span>BV Earned</span><span>${totalBV.toFixed(1)} BV</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;padding:4px 7px;background:#fffbeb;border-radius:5px;border:1px solid #fcd34d;">
          <span style="color:#92400e;">Consultation Fee (${consultFeeLabel || ''}) — ${isInclusive ? 'Included' : 'Separate'}</span>
          <span style="color:#92400e;font-weight:bold;">${formatCurrency(consultFeeTotal || 0)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:bold;border-top:1px solid #ddd;padding-top:6px;margin-top:4px;">
          <span>TOTAL ${!isInclusive ? '(medicines only)' : ''}</span>
          <span style="color:#c41e3a;">${formatCurrency(grandTotal)}</span>
        </div>
        ${!isInclusive ? `<div style="font-size:10px;color:#888;margin-top:2px;">+ N$${consultFeeTotal} consultation fee billed separately</div>` : ''}
      </div>
      <div style="margin-top:16px;border-top:1px dashed #ccc;padding-top:12px;">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#666;margin-top:20px;">
          <div>Patient Signature: _________________</div>
          <div>Date: ____________</div>
        </div>
        <div style="font-size:10px;color:#888;margin-top:8px;">Dispensed by: _______________________________</div>
      </div>
      ${_footer(COMPANY_INFO)}
    </div>`;
}

/* ────────────────────────────────────────────────────────────────
   A4 SALES PDF
   (walk-in and prescription)
─────────────────────────────────────────────────────────────────*/
export function generateSalesPDFHTML({
  receiptNumber, branch, items, totalAmount, totalBV,
  paymentMethod, customerType, customerName, nbNumber,
  referralName, referralNB, cashier, showBV = true,
  cashback = 0, branchAmount = null, distributorProfit = null,
  consultFeeAmount = 0, consultFeeMode = null, saleDate,
}) {
  const branchInfo = BRANCH_DETAILS.find(b => b.name === branch) || {};
  const branchDisplay = branchInfo.name || branch || '';
  const now = saleDate ? new Date(saleDate) : new Date();
  const dateStr = now.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  const isMember = customerType === 'member';
  const isNonMember = !isMember;

  const calcBranchAmt = branchAmount != null ? branchAmount : items.reduce((s, it) => s + ((it.dpPrice || 0) * (Number(it.quantity || it.qty || 1))), 0);
  const calcDistProfit = distributorProfit != null ? distributorProfit : (totalAmount - calcBranchAmt);
  const bvEarned = Number(totalBV || 0);

  const itemRows = items.map(item => {
    const bv = Number(item.bv || item.lineBV || 0);
    const qty = Number(item.quantity || item.qty || 1);
    const cp = item.cpPrice != null ? item.cpPrice : (item.unit_price || item.unitPrice || 0);
    const dp = item.dpPrice != null ? item.dpPrice : 0;
    const profit = isNonMember ? ((cp - dp) * qty) : null;
    const lineTotal = item.line_total || item.lineTotal || cp * qty;

    return `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:8px 10px;">${item.product_name || item.name || item.description || '—'}</td>
      <td style="padding:8px 10px;text-align:center;">${qty}</td>
      ${isNonMember
        ? `<td style="padding:8px 10px;text-align:right;font-weight:600;">${formatCurrency(cp)}</td>
           <td style="padding:8px 10px;text-align:right;color:#1e40af;">${formatCurrency(dp)}</td>
           <td style="padding:8px 10px;text-align:right;color:#e67e22;">${bv > 0 ? bv.toFixed(1) : '—'}</td>
           <td style="padding:8px 10px;text-align:right;color:#16a34a;font-weight:600;">${formatCurrency(profit)}</td>`
        : `<td style="padding:8px 10px;text-align:right;">${formatCurrency(item.unit_price || item.unitPrice || 0)}</td>
           <td style="padding:8px 10px;text-align:right;font-weight:600;">${formatCurrency(lineTotal)}</td>
           ${showBV ? `<td style="padding:8px 10px;text-align:right;color:#e67e22;">${bv > 0 ? bv.toFixed(1) : '—'}</td>` : ''}`
      }
    </tr>`;
  }).join('');

  const consultNote = consultFeeAmount > 0
    ? `<div style="margin-top:10px;padding:10px 14px;border-radius:8px;background:#fffbeb;border:1px solid #fcd34d;font-size:11px;color:#92400e;">
        💼 <strong>Consultation Fee: N$${consultFeeAmount}</strong> — ${consultFeeMode === 'inclusive' ? 'Collected inclusive with medicines' : 'Billed separately'} · <em>NOT included in branch sales totals</em>
      </div>` : '';

  const summarySection = isNonMember
    ? `<div style="margin-top:12px;padding:14px 16px;background:#0f172a;border-radius:8px;color:white;">
        <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);letter-spacing:.08em;margin-bottom:10px;">SALES BREAKDOWN</div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
          <span style="color:rgba(255,255,255,0.7);">Customer Total (CP)</span>
          <span style="font-weight:700;">${formatCurrency(totalAmount)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
          <span style="color:#93c5fd;">Branch Amount (DP Total)</span>
          <span style="font-weight:700;color:#93c5fd;">${formatCurrency(calcBranchAmt)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;padding:6px 10px;background:rgba(74,222,128,0.12);border-radius:6px;">
          <span style="color:#4ade80;">Distributor Profit (CP−DP)</span>
          <span style="font-weight:700;color:#4ade80;">${formatCurrency(calcDistProfit)}</span>
        </div>
        ${bvEarned > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#fbbf24;margin-bottom:4px;"><span>BV Earned</span><span>${bvEarned.toFixed(1)} BV</span></div>` : ''}
        <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:8px;font-style:italic;">* Distributor profit is off branch books and not included in branch sales totals</div>
      </div>`
    : (showBV && bvEarned > 0 ? `<div style="margin-top:10px;padding:10px 14px;border-radius:8px;background:#fffbeb;border:1px solid #fcd34d;">
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#92400e;"><span>BV Earned</span><span>${bvEarned.toFixed(1)} BV</span></div>
      </div>` : '');

  const cashbackSection = (isNonMember && cashback > 0)
    ? `<div style="margin-top:14px;padding:14px;border-radius:8px;background:#fef3c7;border:2px solid #f59e0b;text-align:center;">
        <div style="font-size:18px;font-weight:900;color:#92400e;">🎁 N$${cashback} CASHBACK</div>
        <div style="font-size:11px;color:#b45309;margin-top:4px;">Customer is entitled to N$${cashback} cashback for this non-member purchase</div>
      </div>` : '';

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
    <div style="font-size:11px;font-weight:700;letter-spacing:.12em;padding:4px 14px;border-radius:20px;background:#fff0f3;color:#c41e3a;border:1.5px solid #c41e3a44;display:inline-block;">SALES INVOICE</div>
    <div class="invoice-num">${receiptNumber}</div>
    <div style="font-size:12px;color:#64748b;margin-top:4px;">${dateStr}</div>
    <div style="font-size:11px;color:#94a3b8;">${timeStr}</div>
  </div>
</div>
<div class="meta-grid">
  <div><div class="meta-label">Customer</div><div class="meta-value">${customerName || '—'}</div></div>
  <div><div class="meta-label">Customer Type</div><div class="meta-value">${isMember ? '🏅 Member (DP Price)' : '👤 Non-Member (CP Price)'}</div></div>
  ${nbNumber ? `<div><div class="meta-label">NB Number</div><div class="meta-value">${nbNumber}</div></div>` : ''}
  ${isNonMember && referralName ? `<div><div class="meta-label">Referral Distributor</div><div class="meta-value">${referralName}${referralNB ? ` (${referralNB})` : ''}</div></div>` : ''}
  <div><div class="meta-label">Payment Method</div><div class="meta-value">${paymentMethod || '—'}</div></div>
  ${cashier ? `<div><div class="meta-label">Served By</div><div class="meta-value">${cashier}</div></div>` : ''}
</div>
<table>
  <thead><tr>
    <th>Item Description</th>
    <th style="text-align:center;">Qty</th>
    ${isNonMember
      ? `<th style="text-align:right;">CP Price</th>
         <th style="text-align:right;color:#93c5fd;">DP Price</th>
         <th style="text-align:right;color:#fde68a;">BV</th>
         <th style="text-align:right;color:#86efac;">Dist. Profit</th>`
      : `<th style="text-align:right;">Unit Price (DP)</th>
         <th style="text-align:right;">Line Total</th>
         ${showBV ? '<th style="text-align:right;color:#fde68a;">BV</th>' : ''}`
    }
  </tr></thead>
  <tbody>${itemRows}</tbody>
  <tfoot><tr>
    <td colspan="2" style="text-align:right;color:#64748b;">Subtotal</td>
    ${isNonMember
      ? `<td style="text-align:right;font-weight:700;">${formatCurrency(totalAmount)}</td>
         <td style="text-align:right;color:#1e40af;">${formatCurrency(calcBranchAmt)}</td>
         <td></td>
         <td style="text-align:right;color:#16a34a;">${formatCurrency(calcDistProfit)}</td>`
      : `<td></td>
         <td style="text-align:right;">${formatCurrency(totalAmount)}</td>
         ${showBV && bvEarned > 0 ? `<td style="text-align:right;color:#e67e22;">${bvEarned.toFixed(1)} BV</td>` : ''}`
    }
  </tr></tfoot>
</table>
<div class="total-box">
  <div class="total-label">GRAND TOTAL${isNonMember ? ' (CP)' : ''}</div>
  <div class="total-amount">${formatCurrency(totalAmount)}</div>
</div>
${summarySection}
${cashbackSection}
${consultNote}
<div class="footer">
  <p style="margin:0;font-size:11px;font-weight:600;color:#374151;">Thank you for shopping with Dynapharm International Namibia!</p>
  <p style="margin:4px 0;">${COMPANY_INFO.tagline}</p>
  <p style="margin:2px 0;">Facebook: ${COMPANY_INFO.socialMedia.facebook.replace('https://www.facebook.com/', '@')} &nbsp;|&nbsp; WhatsApp: ${COMPANY_INFO.socialMedia.whatsapp}</p>
</div>
</body></html>`;
}

/* ────────────────────────────────────────────────────────────────
   A4 PRESCRIPTION QUOTE PDF
   Member → DP price only per item
   Non-member → CP price only per item
─────────────────────────────────────────────────────────────────*/
export function generatePrescriptionQuotePDFHTML({
  rxId, branch, patientName, membershipStatus, consultantName,
  items, consultFeeTotal, consultFeeLabel, consultMode, date,
}) {
  const branchInfo = BRANCH_DETAILS.find(b => b.name === branch) || {};
  const branchDisplay = branchInfo.name || branch || '';
  const isMember = membershipStatus === 'member';
  const dateStr = date ? new Date(date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
  const isInclusive = consultMode === 'inclusive';

  const rows = items.map(item => {
    const price = isMember ? item.dp : item.cp;
    const bv = Number(item.bv || 0);
    return `<tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:9px 10px;">${item.name}${item.isPackage ? ' <span style="font-size:10px;background:#e8f5e9;color:#27ae60;padding:1px 5px;border-radius:3px;">Package</span>' : ''}</td>
      <td style="padding:9px 10px;text-align:center;color:${item.dispensed ? '#16a34a' : '#e67e22'}">${item.dispensed ? '✅ Dispensed' : '⏳ Pending'}</td>
      <td style="padding:9px 10px;text-align:right;font-weight:600;">${formatCurrency(price)}</td>
      ${isMember ? `<td style="padding:9px 10px;text-align:right;color:#e67e22;">${bv > 0 ? bv.toFixed(1) : '—'}</td>` : ''}
    </tr>`;
  }).join('');

  const medTotal = items.reduce((s, m) => s + (isMember ? m.dp : m.cp), 0);
  const totalBV = items.reduce((s, m) => s + (m.bv || 0), 0);
  const grandTotal = medTotal + (isInclusive ? (consultFeeTotal || 0) : 0);

  return `<!DOCTYPE html>
<html><head><title>Prescription Quote — ${patientName || rxId}</title>
<style>
  @media print { body { margin:0; } @page { size:A4; margin:15mm; } .no-print{display:none;} }
  * { box-sizing:border-box; }
  body { font-family:Arial,sans-serif; font-size:12px; color:#333; margin:20px; }
  .header { text-align:center; padding-bottom:16px; margin-bottom:20px; border-bottom:3px solid #c41e3a; }
  .logo { height:55px; margin-bottom:6px; }
  .co-name { color:#c41e3a; font-size:18px; font-weight:bold; margin:0; }
  .co-tag { color:#888; font-size:11px; margin:2px 0; }
  .rx-title { background:#c41e3a; color:white; font-size:14px; font-weight:bold; letter-spacing:2px; padding:5px 20px; border-radius:20px; display:inline-block; margin-top:8px; }
  .patient-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:18px; }
  .patient-grid .field { font-size:11px; color:#64748b; }
  .patient-grid .value { font-weight:bold; color:#1e293b; font-size:12px; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; }
  thead tr { background:#1e3a5f; }
  thead th { color:white; padding:9px 10px; text-align:left; font-size:11px; font-weight:600; letter-spacing:0.5px; }
  tbody tr:nth-child(even) { background:#f8fafc; }
  .summary-box { background:#0f172a; color:white; border-radius:8px; padding:16px 20px; margin-bottom:20px; }
  .sum-row { display:flex; justify-content:space-between; font-size:12px; padding:3px 0; color:rgba(255,255,255,0.8); }
  .sum-row.total { font-size:15px; font-weight:bold; color:#4ade80; border-top:1px solid rgba(255,255,255,0.2); padding-top:8px; margin-top:4px; }
  .consult-box { border:2px solid #f59e0b; border-radius:8px; padding:14px; background:#fffbeb; margin-bottom:16px; }
  .sig { margin-top:40px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:30px; }
  .sig-line { border-top:1px solid #aaa; padding-top:4px; font-size:10px; color:#666; text-align:center; }
  .print-btn { background:#1e3a5f; color:white; border:none; padding:10px 24px; border-radius:8px; font-size:13px; cursor:pointer; margin-bottom:16px; }
</style></head><body>
<button class="no-print print-btn" onclick="window.print()">🖨️ Print PDF</button>
<div class="header">
  <img class="logo" src="${COMPANY_INFO.logo}" onerror="this.style.display='none'" />
  <div class="co-name">${COMPANY_INFO.name}</div>
  <div class="co-tag">${COMPANY_INFO.tagline}</div>
  ${branchDisplay ? `<div style="font-size:11px;color:#555;margin-top:2px;">${branchDisplay} Branch${branchInfo.address ? ' · ' + branchInfo.address : ''}</div>` : ''}
  <div class="rx-title">PRESCRIPTION QUOTE</div>
</div>
<div class="patient-grid">
  <div><div class="field">Patient Name</div><div class="value">${patientName || '—'}</div></div>
  <div><div class="field">Prescription #</div><div class="value">${rxId}</div></div>
  <div><div class="field">Membership</div><div class="value">${isMember ? '🏅 Member (DP Price)' : '👤 Non-Member (CP Price)'}</div></div>
  <div><div class="field">Date</div><div class="value">${dateStr}</div></div>
  ${consultantName ? `<div><div class="field">Consultant</div><div class="value">${consultantName}</div></div>` : ''}
  <div><div class="field">Branch</div><div class="value">${branchDisplay || '—'}</div></div>
</div>
<table>
  <thead><tr>
    <th>Prescribed Item</th>
    <th style="text-align:center;">Status</th>
    <th style="text-align:right;">${isMember ? 'DP Price' : 'CP Price'}</th>
    ${isMember ? '<th style="text-align:right;">BV</th>' : ''}
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr style="background:#f1f5f9;font-weight:bold;">
    <td colspan="2" style="padding:9px 10px;">Medicines Subtotal</td>
    <td style="padding:9px 10px;text-align:right;">${formatCurrency(medTotal)}</td>
    ${isMember ? `<td style="padding:9px 10px;text-align:right;color:#e67e22;">${totalBV > 0 ? totalBV.toFixed(1) : '—'}</td>` : ''}
  </tr></tfoot>
</table>
<div class="consult-box">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
    <div>
      <div style="font-weight:bold;color:#92400e;font-size:13px;">💼 Consultation Fee — ${consultFeeLabel || ''}</div>
      <div style="font-size:11px;color:#b45309;">${isInclusive ? 'Included in total' : 'Billed separately'} · Not counted in branch sales</div>
    </div>
    <div style="font-size:18px;font-weight:900;color:#92400e;">N$${consultFeeTotal || 0}</div>
  </div>
</div>
<div class="summary-box">
  <div class="sum-row"><span>Medicines Subtotal (${isMember ? 'DP' : 'CP'}):</span><span>${formatCurrency(medTotal)}</span></div>
  ${isMember && totalBV > 0 ? `<div class="sum-row"><span>BV Earned:</span><span style="color:#fbbf24;">${totalBV.toFixed(1)} BV</span></div>` : ''}
  <div class="sum-row"><span>Consultation Fee (${isInclusive ? 'included' : 'separate'}):</span><span style="color:#fbbf24;">${formatCurrency(consultFeeTotal || 0)}</span></div>
  <div class="sum-row total"><span>GRAND TOTAL${!isInclusive ? ' (medicines only)' : ''}:</span><span>${formatCurrency(grandTotal)}</span></div>
  ${!isInclusive ? `<div class="sum-row" style="font-size:10px;color:rgba(255,255,255,0.4)"><span>+ N$${consultFeeTotal} consultation fee billed separately</span></div>` : ''}
</div>
<div class="sig">
  <div class="sig-line">Dispensed by: ___________________</div>
  <div class="sig-line">Patient / Guardian Signature</div>
  <div class="sig-line">Date: ___________________________</div>
</div>
</body></html>`;
}

export function printReceipt(receiptHTML) {
  const printWindow = window.open('', '_blank', 'width=450,height=700');
  if (!printWindow) return;
  printWindow.document.write(`
    <!DOCTYPE html><html><head><title>Receipt</title>
    <style>
      @media print {
        body { margin: 0; }
        @page { size: 80mm auto; margin: 3mm; }
        .page-break { page-break-after: always; break-after: page; height: 0; }
      }
      body { margin: 20px; }
      .page-break { border-top: 2px dashed #ccc; margin: 24px 0; padding: 0; }
    </style>
    </head><body>${receiptHTML.replace(/<div style="page-break-after:always;"><\/div>/g, '<div class="page-break"></div>')}
    <script>window.onload = function() { window.print(); }<\/script>
    </body></html>`);
  printWindow.document.close();
}

export function printSalesPDF(params) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(generateSalesPDFHTML(params));
  w.document.close();
}

/* ── Shared private helpers ── */
function _header(COMPANY_INFO, branchDisplay, branchInfo) {
  return `<div style="text-align:center;padding:14px 0;border-bottom:2px solid #c41e3a;">
    <img src="${COMPANY_INFO.logo}" alt="Dynapharm" style="height:55px;margin-bottom:6px;" onerror="this.style.display='none'" />
    <div style="margin:0;color:#c41e3a;font-size:15px;font-weight:bold;">${COMPANY_INFO.name}</div>
    <div style="margin:2px 0;font-size:10px;color:#666;">${COMPANY_INFO.tagline}</div>
    ${branchDisplay ? `<div style="margin:3px 0 0;font-size:11px;color:#555;font-weight:bold;">${branchDisplay} Branch</div>` : ''}
    ${branchInfo.address ? `<div style="margin:1px 0;font-size:9px;color:#777;">${branchInfo.address}</div>` : ''}
    ${branchInfo.phone ? `<div style="margin:1px 0;font-size:9px;color:#777;">Tel: ${branchInfo.phone}</div>` : ''}
  </div>`;
}

function _footer(COMPANY_INFO) {
  return `<div style="text-align:center;padding:12px 0;border-top:1px dashed #ccc;font-size:10px;color:#999;margin-top:8px;">
    <div style="margin:0;">Thank you for shopping with Dynapharm!</div>
    <div style="margin:3px 0;">${COMPANY_INFO.tagline}</div>
    <div style="margin:2px 0;">FB: ${COMPANY_INFO.socialMedia.facebook.replace('https://www.facebook.com/', '@')} | WA: ${COMPANY_INFO.socialMedia.whatsapp}</div>
  </div>`;
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

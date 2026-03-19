import { COMPANY_INFO, BRANCH_DETAILS, formatCurrency } from './constants';

export function generateReceiptHTML({ receiptNumber, branch, items, totalAmount, totalBV, paymentMethod, customerType, customerName, cashier, showBV = true }) {
  const branchInfo = BRANCH_DETAILS.find(b => b.name === branch) || {};
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const itemRows = items.map(item => `
    <tr>
      <td style="padding:4px 8px;text-align:left;border-bottom:1px solid #eee;font-size:12px;">${item.product_name || item.name || item.description}</td>
      <td style="padding:4px 8px;text-align:center;border-bottom:1px solid #eee;font-size:12px;">${item.quantity || item.qty}</td>
      <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee;font-size:12px;">${formatCurrency(item.unit_price || item.unitPrice)}</td>
      <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee;font-size:12px;">${formatCurrency(item.line_total || item.lineTotal)}</td>
      ${showBV ? `<td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee;font-size:12px;">${(item.bv || item.lineBV || 0).toFixed ? (item.bv || item.lineBV || 0).toFixed(1) : (item.bv || item.lineBV || 0)}</td>` : ''}
    </tr>
  `).join('');

  return `
    <div style="max-width:400px;margin:0 auto;font-family:Arial,sans-serif;color:#333;">
      <div style="text-align:center;padding:16px 0;border-bottom:2px solid #c41e3a;">
        <img src="${COMPANY_INFO.logo}" alt="Dynapharm" style="height:60px;margin-bottom:8px;" onerror="this.style.display='none'" />
        <h2 style="margin:0;color:#c41e3a;font-size:16px;">${COMPANY_INFO.name}</h2>
        <p style="margin:2px 0;font-size:11px;color:#666;">${COMPANY_INFO.tagline}</p>
        ${branchInfo.name ? `<p style="margin:4px 0 0;font-size:11px;color:#555;font-weight:bold;">${branchInfo.name} Branch</p>` : ''}
        ${branchInfo.address ? `<p style="margin:2px 0;font-size:10px;color:#777;">${branchInfo.address}</p>` : ''}
        ${branchInfo.phone ? `<p style="margin:2px 0;font-size:10px;color:#777;">Tel: ${branchInfo.phone}</p>` : ''}
      </div>
      <div style="padding:12px 0;border-bottom:1px dashed #ccc;">
        <table style="width:100%;font-size:11px;">
          <tr><td style="color:#888;">Receipt #:</td><td style="text-align:right;font-weight:bold;">${receiptNumber}</td></tr>
          <tr><td style="color:#888;">Date:</td><td style="text-align:right;">${dateStr}</td></tr>
          <tr><td style="color:#888;">Time:</td><td style="text-align:right;">${timeStr}</td></tr>
          ${customerName ? `<tr><td style="color:#888;">Customer:</td><td style="text-align:right;">${customerName}</td></tr>` : ''}
          <tr><td style="color:#888;">Type:</td><td style="text-align:right;">${customerType === 'member' ? 'Member (DP)' : 'Non-Member (CP)'}</td></tr>
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
              ${showBV ? '<th style="padding:6px 8px;text-align:right;font-size:11px;border-bottom:2px solid #ddd;">BV</th>' : ''}
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
        ${showBV && totalBV > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:#666;margin-top:4px;"><span>Total BV</span><span>${typeof totalBV === 'number' ? totalBV.toFixed(1) : totalBV}</span></div>` : ''}
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
    <script>window.onload = function() { window.print(); }</script>
    </body></html>
  `);
  printWindow.document.close();
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

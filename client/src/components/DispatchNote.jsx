import { useRef } from 'react';

function generateBarcodeSVG(value) {
  const CODE128_START_B = 104;
  const CODE128_STOP = 106;
  const patterns = [
    '11011001100','11001101100','11001100110','10010011000','10010001100',
    '10001001100','10011001000','10011000100','10001100100','11001001000',
    '11001000100','11000100100','10110011100','10011011100','10011001110',
    '10111001100','10011101100','10011100110','11001110010','11001011100',
    '11001001110','11011100100','11001110100','11100101100','11100100110',
    '11101100100','11100110100','11100110010','11011011000','11011000110',
    '11000110110','10100011000','10001011000','10001000110','10110001000',
    '10001101000','10001100010','11010001000','11000101000','11000100010',
    '10110111000','10110001110','10001101110','10111011000','10111000110',
    '10001110110','11101110110','11010001110','11000101110','11011101000',
    '11011100010','11011101110','11101011000','11101000110','11100010110',
    '11101101000','11101100010','11100011010','11101111010','11001000010',
    '11110001010','10100110000','10100001100','10010110000','10010000110',
    '10000101100','10000100110','10110010000','10110000100','10011010000',
    '10011000010','10000110100','10000110010','11000010010','11001010000',
    '11110111010','11000010100','10001111010','10100111100','10010111100',
    '10010011110','10111100100','10011110100','10011110010','11110100100',
    '11110010100','11110010010','11011011110','11110110110','11110101000',
    '11110100010','10111011110','10111101110','11101011110','11110101110',
    '11010000100','11010010000','11010011100','1100011101011'
  ];
  const charToVal = (c) => c.charCodeAt(0) - 32;
  let checksum = CODE128_START_B;
  let binary = patterns[CODE128_START_B];
  for (let i = 0; i < value.length; i++) {
    const val = charToVal(value[i]);
    checksum += val * (i + 1);
    binary += patterns[val];
  }
  binary += patterns[checksum % 103];
  binary += patterns[CODE128_STOP];
  const barWidth = 2;
  const height = 60;
  let x = 0;
  let bars = '';
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === '1') {
      bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`;
    }
    x += barWidth;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${height + 18}" viewBox="0 0 ${x} ${height + 18}">
    ${bars}
    <text x="${x/2}" y="${height + 14}" text-anchor="middle" font-family="monospace" font-size="12" font-weight="bold">${value}</text>
  </svg>`;
}

const WAREHOUSE_INFO = {
  windhoek_warehouse: { name: 'Windhoek Warehouse', location: 'Windhoek, Khomas Region', contact: '+264 817499757' },
  ondangwa_warehouse: { name: 'Ondangwa Warehouse', location: 'Ondangwa, Oshana Region', contact: '+264 814685882' },
  country_stock: { name: 'Country Stock (National)', location: 'Windhoek Head Office', contact: '+264 817499757' },
};

const BRANCH_INFO = {
  windhoek_cbd: { name: 'Windhoek CBD', code: 'WDH-CBD', address: '269 Independence Avenue, Shop No 1, Continental Building', phone: '+264 817499757', region: 'Khomas' },
  windhoek: { name: 'Windhoek CBD', code: 'WDH-CBD', address: '269 Independence Avenue, Shop No 1, Continental Building', phone: '+264 817499757', region: 'Khomas' },
  tsumeb: { name: 'Tsumeb', code: 'TSB', address: 'Shop No 35B, Erf 35, Maria Nehoya Street', phone: '+264 814757074', region: 'Oshikoto' },
  gobabis: { name: 'Gobabis', code: 'GOB', address: 'Shop No 8, Erf 939, Wordmann Brock Complex, Church Street', phone: '+264 814685905', region: 'Omaheke' },
  swakopmund: { name: 'Swakopmund', code: 'SWK', address: '153 Kuruseb Road, Mondesa', phone: '+264 814686806', region: 'Erongo' },
  outapi: { name: 'Outapi', code: 'OTP', address: 'Okasikili Location, Next to Lamek Garage', phone: '+264 814685886', region: 'Omusati' },
  okahao: { name: 'Okahao', code: 'OKH', address: 'Erf 331 Taapopi Complex, Tsandi Main Road', phone: '+264 814683963', region: 'Omusati' },
  oshakati: { name: 'Oshakati', code: 'OSH', address: 'Shop No 15 Fantasy Complex, Behind Bank Windhoek', phone: '+264 814757055', region: 'Oshana' },
  otjiwarongo: { name: 'Otjiwarongo', code: 'OTJ', address: 'Shop No 13, Erindi Complex, Albertina Amadhila Street', phone: '+264 814681997', region: 'Otjozondjupa' },
  eenhana: { name: 'Eenhana', code: 'EEN', address: 'Shop No 3, Tangi Complex, Dimo Amambi Street', phone: '+264 814682049', region: 'Ohangwena' },
  ondangwa: { name: 'Ondangwa', code: 'OND', address: 'Shop No 3, Oluno Road, Wordmann Brock Mall', phone: '+264 814685882', region: 'Oshana' },
  rundu: { name: 'Rundu', code: 'RND', address: 'Shop No 6, Erf 1736, Markus Siwarongo Street', phone: '+264 814684968', region: 'Kavango East' },
  walvis_bay: { name: 'Walvis Bay', code: 'WLV', address: 'Shop No 6, Pelican Mall', phone: '+264 814685894', region: 'Erongo' },
  hochlandpark: { name: 'Hochlandpark', code: 'HLP', address: '21 Robin Road, Tauben Glen', phone: '+264 813207195', region: 'Khomas' },
  khomasdal: { name: 'Khomasdal', code: 'KHO', address: 'Shop No 2, Khomasdal Funky Town Mall', phone: '+264 814682991', region: 'Khomas' },
  katima_mulilo: { name: 'Katima Mulilo', code: 'KAT', address: 'Shop No 1, Hospital Road', phone: '+264 814682978', region: 'Zambezi' },
  katima: { name: 'Katima Mulilo', code: 'KAT', address: 'Shop No 1, Hospital Road', phone: '+264 814682978', region: 'Zambezi' },
};

function lookupBranch(key) {
  if (!key) return null;
  const k = key.toLowerCase().replace(/\s+/g, '_').replace(/_branch$/, '');
  return BRANCH_INFO[k] || BRANCH_INFO[k.replace(/_branch$/, '')] || null;
}

function lookupWarehouse(key) {
  if (!key) return null;
  const k = key.toLowerCase().replace(/\s+/g, '_');
  return WAREHOUSE_INFO[k] || WAREHOUSE_INFO[k + '_warehouse'] || null;
}

function fmtLoc(key) {
  if (!key) return '—';
  const wh = lookupWarehouse(key);
  if (wh) return wh.name;
  const br = lookupBranch(key);
  if (br) return br.name;
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; }
}

function fmtDateTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
}

const GM_ACTION_LABELS = {
  approve: 'Approved',
  reject: 'Rejected',
  amend_approve: 'Amended & Approved',
  return: 'Returned for Correction',
};

const STATUS_STYLES = {
  pending_approval: { bg: '#fef3c7', color: '#92400e', border: '#f59e0b', label: 'Pending GM Approval' },
  approved: { bg: '#d1fae5', color: '#065f46', border: '#10b981', label: 'Approved' },
  rejected: { bg: '#fee2e2', color: '#991b1b', border: '#ef4444', label: 'Rejected' },
  received: { bg: '#dbeafe', color: '#1e40af', border: '#3b82f6', label: 'Received' },
  delivered: { bg: '#d1fae5', color: '#065f46', border: '#10b981', label: 'Delivered' },
  partially_received: { bg: '#fef3c7', color: '#92400e', border: '#f59e0b', label: 'Partially Received' },
  discrepancy_reported: { bg: '#fee2e2', color: '#991b1b', border: '#ef4444', label: 'Discrepancy Reported' },
  returned: { bg: '#fce7f3', color: '#9d174d', border: '#ec4899', label: 'Returned for Correction' },
  submitted: { bg: '#e0e7ff', color: '#3730a3', border: '#6366f1', label: 'Submitted' },
};

const PRINT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #1a1a1a; font-size: 12px; line-height: 1.4; }
  .doc-header { text-align: center; border-bottom: 3px solid #c41e3a; padding-bottom: 14px; margin-bottom: 18px; }
  .doc-header h1 { color: #c41e3a; font-size: 20px; margin-bottom: 2px; letter-spacing: 1px; }
  .doc-header h2 { font-size: 16px; font-weight: 800; color: #1a1a1a; margin: 4px 0; letter-spacing: 2px; text-transform: uppercase; }
  .doc-header .subtitle { font-size: 11px; color: #6b7280; }
  .header-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
  .header-bar .ref-block { text-align: right; }
  .barcode-block { text-align: center; margin: 8px 0 4px 0; }
  .barcode-block svg { max-width: 280px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .info-box { padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #fafafa; }
  .info-box.full { grid-column: 1 / -1; }
  .info-box h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #c41e3a; font-weight: 700; margin-bottom: 6px; border-bottom: 1px solid #fecdd3; padding-bottom: 4px; }
  .info-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .info-label { font-size: 10px; color: #6b7280; font-weight: 600; text-transform: uppercase; }
  .info-value { font-size: 12px; font-weight: 600; color: #1a1a1a; }
  .status-badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 11px; font-weight: 700; border: 1px solid; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
  thead th { background: #c41e3a; color: white; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th.right { text-align: right; }
  thead th.center { text-align: center; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
  tbody td.right { text-align: right; }
  tbody td.center { text-align: center; }
  tbody td.bold { font-weight: 700; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tfoot td { padding: 7px 8px; border-top: 2px solid #c41e3a; font-weight: 800; font-size: 12px; }
  tfoot td.right { text-align: right; }
  .section { margin-bottom: 14px; }
  .section-title { font-size: 11px; font-weight: 800; color: #c41e3a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; padding-bottom: 3px; border-bottom: 1px solid #fecdd3; }
  .section-box { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; background: #fafafa; min-height: 40px; }
  .section-box.amended { background: #fffbeb; border-color: #f59e0b; }
  .section-box.receipt { background: #f0fdf4; border-color: #86efac; }
  .section-box.discrepancy { background: #fef2f2; border-color: #fca5a5; }
  .amendment-row { display: flex; gap: 16px; margin-bottom: 4px; font-size: 11px; }
  .amendment-row .original { color: #dc2626; text-decoration: line-through; }
  .amendment-row .approved { color: #16a34a; font-weight: 700; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 24px; padding-top: 14px; border-top: 2px solid #c41e3a; }
  .sig-box { }
  .sig-title { font-size: 10px; color: #6b7280; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
  .sig-name { font-size: 12px; font-weight: 600; margin-bottom: 2px; }
  .sig-line { border-bottom: 1px solid #1a1a1a; height: 30px; margin-bottom: 4px; }
  .sig-sublabel { font-size: 9px; color: #9ca3af; }
  .audit-footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #e5e7eb; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 10px; color: #9ca3af; }
  .audit-footer .item { }
  .audit-footer .label { font-weight: 600; text-transform: uppercase; font-size: 9px; }
  .doc-footer { text-align: center; margin-top: 16px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #b0b0b0; }
  .variance-neg { color: #dc2626; font-weight: 700; }
  .variance-pos { color: #16a34a; font-weight: 700; }
  .no-print { }
  @media print { body { padding: 12px; } .no-print { display: none !important; } }
`;

export default function DispatchNote({ transfer, onClose, mode = 'view' }) {
  const printRef = useRef(null);
  if (!transfer) return null;

  const t = transfer;
  const meta = t.metadata || {};
  const items = Array.isArray(t.items) ? t.items : [];

  // Detect FEFO batch-split mode: any item carries a batchNo
  const hasBatchSplits = items.some(it => it.batchNo || it.batch_no);

  // Group batch-split items by product so we can render sub-rows
  const batchGroups = (() => {
    if (!hasBatchSplits) return [];
    const groupMap = new Map();
    items.forEach(item => {
      const name = (item.productName || item.product_name || '').trim();
      const key = name.toLowerCase();
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          displayName: name || '—',
          productCode: item.productCode || item.product_code || item.sku || '',
          unit: item.unit || 'units',
          totalQty: 0,
          totalApproved: null,
          totalReceived: null,
          batches: [],
          remarks: item.discrepancyNote || item.discrepancy_note || item.lineNote || item.line_note || '',
        });
      }
      const g = groupMap.get(key);
      const qtyPrep = Number(item.quantity || 0);
      const qtyAppr = item.quantityApproved ?? item.quantity_approved;
      const qtyRecv = item.quantityReceived ?? item.quantity_received;
      g.totalQty += qtyPrep;
      if (qtyAppr != null) g.totalApproved = (g.totalApproved || 0) + Number(qtyAppr);
      if (qtyRecv != null) g.totalReceived = (g.totalReceived || 0) + Number(qtyRecv);
      g.batches.push({
        batchNo: item.batchNo || item.batch_no || '',
        expiryDate: item.expiryDate || item.expiry_date || null,
        qty: qtyPrep,
      });
    });
    return [...groupMap.values()];
  })();

  const isAmended = t.gmAction === 'amend_approve' || t.gm_action === 'amend_approve' || meta.amended;
  const gmAction = t.gmAction || t.gm_action || null;
  const gmComment = t.gmComment || t.gm_comment || null;
  const amendedBy = t.amendedByGm || t.amended_by_gm || null;
  const amendedAt = t.amendedAt || t.amended_at || null;
  const approvedBy = meta.approved_by || amendedBy || null;
  const rejectedBy = meta.rejected_by || null;
  const receiptStatus = t.receiptStatus || t.receipt_status || null;
  const signatureName = t.signatureName || t.signature_name || null;
  const branchNote = t.branchReceiptNote || t.branch_receipt_note || null;
  const hasDiscrepancy = t.discrepancyFlag || t.discrepancy_flag || false;
  const dispatchNotes = t.dispatchNotes || t.dispatch_notes || null;
  const createdBy = t.createdBy || t.created_by || null;
  const dispatchedBy = t.dispatchedBy || t.dispatched_by || null;
  const receivedBy = t.receivedBy || t.received_by || signatureName || null;
  const preparedByRole = t.preparedByRole || t.prepared_by_role || null;
  const rawDestinationBranchStaff = t.destinationBranchStaff || t.destination_branch_staff || null;
  const destinationBranchStaff = Array.isArray(rawDestinationBranchStaff)
    ? rawDestinationBranchStaff.filter(s => (s.role || '').toLowerCase() === 'dispenser')
    : rawDestinationBranchStaff;
  const gmApprovedAt = t.gmApprovedAt || t.gm_approved_at || null;
  const gmApprovedBy = t.gmApprovedBy || t.gm_approved_by || null;

  const sourceKey = t.from_location || t.fromWarehouse || '';
  const destKey = t.to_location || t.toBranch || '';
  const sourceWH = lookupWarehouse(sourceKey);
  const destBranch = lookupBranch(destKey);

  const dispRef = t.dispatchNote?.barcode || t.dispatchReference || `DN-${String(t.id).padStart(6, '0')}`;
  const barcodeSVG = generateBarcodeSVG(dispRef.slice(0, 30));

  const createdAt = t.createdAt || t.created_at || null;
  const updatedAt = t.updatedAt || t.updated_at || null;
  const dispatchedAt = t.dispatchedAt || t.dispatched_at || createdAt;

  const statusStyle = STATUS_STYLES[t.status] || { bg: '#f3f4f6', color: '#374151', border: '#d1d5db', label: t.status || 'Unknown' };

  const hasReceipt = receiptStatus || t.status === 'delivered' || t.status === 'received' || t.status === 'partially_received';
  const hasGMAction = !!gmAction;

  const totalPrepared = items.reduce((s, it) => s + Number(it.quantity || 0), 0);
  const totalApproved = items.reduce((s, it) => s + Number(it.quantityApproved ?? it.quantity_approved ?? it.quantity ?? 0), 0);
  const totalReceived = items.reduce((s, it) => s + Number(it.quantityReceived ?? it.quantity_received ?? 0), 0);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Dispatch Note - ${dispRef}</title><style>${PRINT_CSS}</style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  };

  const renderDocument = () => (
    <div ref={printRef}>
      {/* === A. HEADER === */}
      <div className="doc-header" style={{ textAlign: 'center', borderBottom: '3px solid #c41e3a', paddingBottom: 14, marginBottom: 18 }}>
        <h1 style={{ color: '#c41e3a', fontSize: 20, margin: 0, letterSpacing: 1 }}>DYNAPHARM INTERNATIONAL NAMIBIA</h1>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a', margin: '4px 0', letterSpacing: 2, textTransform: 'uppercase' }}>DISPATCH NOTE</h2>
        <div style={{ fontSize: 11, color: '#6b7280' }}>Stock Transfer Document — Official Copy</div>
      </div>

      {/* Reference + Barcode row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px', fontSize: 12 }}>
            <span style={lbl}>Dispatch Note No:</span><span style={val}>{dispRef}</span>
            <span style={lbl}>Dispatch Date:</span><span style={val}>{fmtDateTime(dispatchedAt)}</span>
            <span style={lbl}>Status:</span>
            <span>
              <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}>
                {statusStyle.label}
              </span>
            </span>
            <span style={lbl}>Prepared By:</span><span style={val}>{createdBy || dispatchedBy || '—'}</span>
            <span style={lbl}>Role:</span><span style={val}>{preparedByRole || 'Stock Controller'}</span>
            {gmAction && <><span style={lbl}>GM Approval:</span><span style={val}>{GM_ACTION_LABELS[gmAction] || gmAction}</span></>}
            {(gmAction === 'approve' || gmAction === 'amend_approve') && <><span style={lbl}>GM Name:</span><span style={val}>{gmApprovedBy || approvedBy || '—'}</span></>}
            {(gmAction === 'approve' || gmAction === 'amend_approve') && <><span style={lbl}>GM Approval Date:</span><span style={val}>{fmtDateTime(gmApprovedAt || amendedAt || updatedAt)}</span></>}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div dangerouslySetInnerHTML={{ __html: barcodeSVG }} />
        </div>
      </div>

      {/* === B. SOURCE AND DESTINATION === */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={sectionBox}>
          <h4 style={sectionHead}>Source Warehouse</h4>
          <div style={infoRow}><span style={lbl}>Name:</span><span style={val}>{sourceWH?.name || fmtLoc(sourceKey)}</span></div>
          {sourceWH?.location && <div style={infoRow}><span style={lbl}>Location:</span><span style={val}>{sourceWH.location}</span></div>}
          {sourceWH?.contact && <div style={infoRow}><span style={lbl}>Contact:</span><span style={val}>{sourceWH.contact}</span></div>}
        </div>
        <div style={sectionBox}>
          <h4 style={sectionHead}>Destination Branch</h4>
          <div style={infoRow}><span style={lbl}>Branch:</span><span style={val}>{destBranch?.name || fmtLoc(destKey)}</span></div>
          {destBranch?.code && <div style={infoRow}><span style={lbl}>Branch Code:</span><span style={{ ...val, fontFamily: 'monospace' }}>{destBranch.code}</span></div>}
          {destBranch?.address && <div style={infoRow}><span style={lbl}>Address:</span><span style={{ ...val, fontWeight: 400, fontSize: 11 }}>{destBranch.address}</span></div>}
          {destBranch?.phone && <div style={infoRow}><span style={lbl}>Phone:</span><span style={val}>{destBranch.phone}</span></div>}
          {destBranch?.region && <div style={infoRow}><span style={lbl}>Region:</span><span style={val}>{destBranch.region}</span></div>}
        </div>
      </div>

      {/* === B2. DESTINATION BRANCH STAFF === */}
      {Array.isArray(destinationBranchStaff) && destinationBranchStaff.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={sectionTitle}>Destination Branch Dispensers</div>
          <div style={{ ...sectionBoxStyle, background: '#f0fdf4', borderColor: '#86efac' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ background: '#166534', color: 'white', padding: '5px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700 }}>Name</th>
                  <th style={{ background: '#166534', color: 'white', padding: '5px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700 }}>Role</th>
                  <th style={{ background: '#166534', color: 'white', padding: '5px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700 }}>Phone</th>
                </tr>
              </thead>
              <tbody>
                {destinationBranchStaff.map((s, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f0fdf4' }}>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #d1fae5', fontWeight: 600 }}>{s.name}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #d1fae5', textTransform: 'capitalize' }}>{(s.role || '').replace(/_/g, ' ')}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #d1fae5', color: '#6b7280' }}>{s.phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === C. DISPATCH ITEM TABLE === */}
      <div style={{ marginBottom: 16 }}>
        <div style={sectionTitle}>Dispatch Items</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <TH>#</TH>
              <TH>Product Name</TH>
              <TH>Product Code</TH>
              <TH>Batch No.</TH>
              <TH>Expiry Date</TH>
              <TH>Unit</TH>
              <TH align="right">Qty Prepared</TH>
              <TH align="right">Qty Approved</TH>
              <TH align="right">Qty Received</TH>
              <TH>Remarks</TH>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontStyle: 'italic' }}>No items in this dispatch note</td></tr>
            ) : hasBatchSplits ? (
              batchGroups.flatMap((g, gi) => {
                const isMultiBatch = g.batches.length > 1;
                const rowBg = gi % 2 === 0 ? 'white' : '#f9fafb';
                const approvedColor = g.totalApproved != null && g.totalApproved !== g.totalQty ? '#d97706' : '#333';
                const receivedColor = g.totalReceived != null
                  ? (g.totalReceived !== (g.totalApproved ?? g.totalQty) ? '#dc2626' : '#16a34a')
                  : '#9ca3af';
                const singleBatch = g.batches[0] || {};
                const singleExpiry = singleBatch.expiryDate;
                const singleExpiringSoon = singleExpiry && new Date(singleExpiry) < new Date(Date.now() + 90 * 86400000);

                const productRow = (
                  <tr key={`g-${gi}`} style={{ background: rowBg }}>
                    <TD style={{ fontWeight: 700 }}>{gi + 1}</TD>
                    <TD style={{ fontWeight: 700 }}>{g.displayName}</TD>
                    <TD style={{ fontFamily: 'monospace', fontSize: 10 }}>{g.productCode || '—'}</TD>
                    {isMultiBatch ? (
                      <td colSpan={2} style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb', fontSize: 10, color: '#2563eb', fontWeight: 700 }}>
                        {g.batches.length} batch splits — see below
                      </td>
                    ) : (
                      <>
                        <TD style={{ fontFamily: 'monospace', fontWeight: 700 }}>{singleBatch.batchNo || '—'}</TD>
                        <TD style={{ color: singleExpiringSoon ? '#dc2626' : singleExpiry ? '#333' : '#9ca3af', fontWeight: singleExpiringSoon ? 700 : 400 }}>
                          {singleExpiry ? fmtDate(singleExpiry) : (singleBatch.batchNo ? 'N/A' : '—')}
                        </TD>
                      </>
                    )}
                    <TD>{g.unit}</TD>
                    <TD align="right" style={{ fontWeight: 800 }}>{g.totalQty}</TD>
                    <TD align="right" style={{ fontWeight: 700, color: approvedColor }}>
                      {g.totalApproved != null ? g.totalApproved : '—'}
                    </TD>
                    <TD align="right" style={{ fontWeight: 700, color: receivedColor }}>
                      {g.totalReceived != null ? g.totalReceived : '—'}
                    </TD>
                    <TD style={{ fontSize: 10, color: '#64748b', maxWidth: 120 }}>{g.remarks || '—'}</TD>
                  </tr>
                );

                if (!isMultiBatch) return [productRow];

                const subRows = g.batches.map((b, bi) => {
                  const expiringSoon = b.expiryDate && new Date(b.expiryDate) < new Date(Date.now() + 90 * 86400000);
                  return (
                    <tr key={`g-${gi}-b-${bi}`} style={{ background: '#eff6ff', borderLeft: '3px solid #93c5fd' }}>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #dbeafe', fontSize: 10, color: '#9ca3af' }}></td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #dbeafe', fontSize: 10, color: '#475569', fontStyle: 'italic', paddingLeft: 20 }}>
                        ↳ Split {bi + 1}/{g.batches.length}
                      </td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #dbeafe' }}></td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #dbeafe', fontFamily: 'monospace', fontWeight: 700, fontSize: 11 }}>{b.batchNo || '—'}</td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #dbeafe', fontSize: 11, color: expiringSoon ? '#dc2626' : b.expiryDate ? '#333' : '#9ca3af', fontWeight: expiringSoon ? 700 : 400 }}>
                        {b.expiryDate ? fmtDate(b.expiryDate) : 'N/A'}
                      </td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #dbeafe', fontSize: 10, color: '#9ca3af' }}>{g.unit}</td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #dbeafe', textAlign: 'right', fontWeight: 700, fontSize: 11 }}>{b.qty}</td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #dbeafe' }}></td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #dbeafe' }}></td>
                      <td style={{ padding: '4px 8px', borderBottom: '1px solid #dbeafe' }}></td>
                    </tr>
                  );
                });

                return [productRow, ...subRows];
              })
            ) : (
              items.map((item, i) => {
                const qtyPrep = Number(item.quantity || 0);
                const qtyAppr = item.quantityApproved ?? item.quantity_approved;
                const qtyRecv = item.quantityReceived ?? item.quantity_received;
                const expiryDate = item.expiryDate || item.expiry_date;
                const isExpiringSoon = expiryDate && new Date(expiryDate) < new Date(Date.now() + 90 * 86400000);
                const variance = qtyRecv != null ? Number(qtyRecv) - (qtyAppr != null ? Number(qtyAppr) : qtyPrep) : null;

                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                    <TD>{i + 1}</TD>
                    <TD style={{ fontWeight: 600 }}>{item.productName || item.product_name || item.productId || '—'}</TD>
                    <TD style={{ fontFamily: 'monospace', fontSize: 10 }}>{item.productCode || item.product_code || item.sku || '—'}</TD>
                    <TD style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.batchNo || item.batch_no || '—'}</TD>
                    <TD style={{ color: isExpiringSoon ? '#dc2626' : expiryDate ? '#333' : '#9ca3af', fontWeight: isExpiringSoon ? 700 : 400 }}>
                      {expiryDate ? fmtDate(expiryDate) : (item.batchNo || item.batch_no ? 'N/A' : '—')}
                    </TD>
                    <TD>{item.unit || 'units'}</TD>
                    <TD align="right" style={{ fontWeight: 700 }}>{qtyPrep}</TD>
                    <TD align="right" style={{ fontWeight: 700, color: qtyAppr != null && Number(qtyAppr) !== qtyPrep ? '#d97706' : '#333' }}>
                      {qtyAppr != null ? Number(qtyAppr) : '—'}
                    </TD>
                    <TD align="right" style={{ fontWeight: 700, color: qtyRecv != null ? (variance !== 0 ? '#dc2626' : '#16a34a') : '#9ca3af' }}>
                      {qtyRecv != null ? Number(qtyRecv) : '—'}
                    </TD>
                    <TD style={{ fontSize: 10, color: '#64748b', maxWidth: 120 }}>
                      {item.discrepancyNote || item.discrepancy_note || item.lineNote || item.line_note || '—'}
                    </TD>
                  </tr>
                );
              })
            )}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 800, fontSize: 12 }}>
                <td colSpan={6} style={{ padding: '7px 8px', borderTop: '2px solid #c41e3a' }}>TOTALS</td>
                <td style={{ padding: '7px 8px', borderTop: '2px solid #c41e3a', textAlign: 'right', fontWeight: 800 }}>{totalPrepared}</td>
                <td style={{ padding: '7px 8px', borderTop: '2px solid #c41e3a', textAlign: 'right', fontWeight: 800 }}>{totalApproved}</td>
                <td style={{ padding: '7px 8px', borderTop: '2px solid #c41e3a', textAlign: 'right', fontWeight: 800 }}>{hasReceipt ? totalReceived : '—'}</td>
                <td style={{ padding: '7px 8px', borderTop: '2px solid #c41e3a' }}></td>
              </tr>
              {hasReceipt && totalReceived !== totalApproved && (
                <tr>
                  <td colSpan={6} style={{ padding: '4px 8px', fontSize: 11, fontWeight: 700, color: '#dc2626' }}>VARIANCE (Received − Approved)</td>
                  <td colSpan={2}></td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 800, color: totalReceived - totalApproved < 0 ? '#dc2626' : '#16a34a' }}>
                    {totalReceived - totalApproved > 0 ? '+' : ''}{totalReceived - totalApproved}
                  </td>
                  <td></td>
                </tr>
              )}
            </tfoot>
          )}
        </table>
      </div>

      {/* === D. WAREHOUSE / DISPATCH NOTES === */}
      <div style={{ marginBottom: 14 }}>
        <div style={sectionTitle}>Warehouse / Dispatch Notes</div>
        <div style={{ ...sectionBoxStyle, minHeight: 40 }}>
          {dispatchNotes
            ? <div style={{ fontSize: 12 }}>{dispatchNotes}</div>
            : <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>No dispatch notes provided</div>
          }
        </div>
      </div>

      {/* === E. GM APPROVAL SECTION === */}
      <div style={{ marginBottom: 14 }}>
        <div style={sectionTitle}>GM Approval</div>
        <div style={{ ...sectionBoxStyle, background: hasGMAction ? (gmAction === 'approve' || gmAction === 'amend_approve' ? '#f0fdf4' : gmAction === 'reject' ? '#fef2f2' : '#fffbeb') : '#fafafa', borderColor: hasGMAction ? (gmAction === 'approve' || gmAction === 'amend_approve' ? '#86efac' : gmAction === 'reject' ? '#fca5a5' : '#fcd34d') : '#d1d5db' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 14px', fontSize: 12 }}>
            <span style={lbl}>Approval Status:</span>
            <span style={{ fontWeight: 700, color: gmAction === 'approve' || gmAction === 'amend_approve' ? '#065f46' : gmAction === 'reject' ? '#991b1b' : '#92400e' }}>
              {hasGMAction ? (GM_ACTION_LABELS[gmAction] || gmAction) : 'Pending'}
            </span>
            <span style={lbl}>GM Name:</span><span style={val}>{gmApprovedBy || approvedBy || rejectedBy || '—'}</span>
            {(gmAction === 'approve' || gmAction === 'amend_approve') && (
              <><span style={lbl}>Approval Date/Time:</span><span style={val}>{fmtDateTime(gmApprovedAt || amendedAt || updatedAt)}</span></>
            )}
            {gmAction === 'reject' && (
              <><span style={lbl}>Rejection Date/Time:</span><span style={val}>{fmtDateTime(updatedAt)}</span></>
            )}
            <span style={lbl}>GM Comment:</span><span style={{ ...val, fontWeight: 400 }}>{gmComment || '—'}</span>
          </div>

          {isAmended && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #f59e0b' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', marginBottom: 4 }}>Amendment Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 14px', fontSize: 11 }}>
                <span style={lbl}>Amended By:</span><span style={val}>{amendedBy || '—'}</span>
                <span style={lbl}>Amendment Date:</span><span style={val}>{fmtDateTime(amendedAt)}</span>
              </div>
              {items.some(it => {
                const qa = it.quantityApproved ?? it.quantity_approved;
                return qa != null && Number(qa) !== Number(it.quantity);
              }) && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#92400e', marginBottom: 2 }}>Quantity Changes:</div>
                  {items.filter(it => {
                    const qa = it.quantityApproved ?? it.quantity_approved;
                    return qa != null && Number(qa) !== Number(it.quantity);
                  }).map((it, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, fontSize: 11, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600 }}>{it.productName || it.product_name}</span>
                      <span style={{ color: '#dc2626', textDecoration: 'line-through' }}>Original: {it.quantity}</span>
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>Approved: {it.quantityApproved ?? it.quantity_approved}</span>
                    </div>
                  ))}
                </div>
              )}
              {meta.amendment_log && (
                <div style={{ marginTop: 4, fontSize: 11, color: '#92400e' }}>
                  <span style={{ fontWeight: 600 }}>Amendment Note: </span>
                  {typeof meta.amendment_log === 'string' ? meta.amendment_log : Array.isArray(meta.amendment_log) ? meta.amendment_log.map((e, i) => <div key={i}>{typeof e === 'string' ? e : (e.detail || e.note || JSON.stringify(e))}</div>) : JSON.stringify(meta.amendment_log)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* === F. BRANCH RECEIPT SECTION === */}
      <div style={{ marginBottom: 14 }}>
        <div style={sectionTitle}>Branch Receipt</div>
        <div style={{ ...sectionBoxStyle, background: hasReceipt ? '#f0fdf4' : '#fafafa', borderColor: hasReceipt ? '#86efac' : '#d1d5db' }}>
          {hasReceipt ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 14px', fontSize: 12 }}>
              <span style={lbl}>Received By:</span><span style={val}>{receivedBy || '—'}</span>
              <span style={lbl}>Branch Name:</span><span style={val}>{destBranch?.name || fmtLoc(destKey)}</span>
              <span style={lbl}>Date Received:</span><span style={val}>{fmtDateTime(updatedAt)}</span>
              <span style={lbl}>Receipt Status:</span>
              <span style={{ fontWeight: 700, color: receiptStatus === 'received' ? '#065f46' : receiptStatus === 'partially_received' ? '#92400e' : '#991b1b' }}>
                {(receiptStatus || t.status || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              <span style={lbl}>E-Signature:</span><span style={{ ...val, fontStyle: 'italic' }}>{signatureName || '—'}</span>
              <span style={lbl}>Branch Notes:</span><span style={{ ...val, fontWeight: 400 }}>{branchNote || '—'}</span>
              <span style={lbl}>Discrepancy:</span>
              <span style={{ fontWeight: 700, color: hasDiscrepancy ? '#dc2626' : '#065f46' }}>
                {hasDiscrepancy ? 'YES — Discrepancy Reported' : 'No'}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
              Stock not yet received by branch. Receipt details will appear here once the branch confirms receipt.
            </div>
          )}
        </div>
      </div>

      {/* === DISCREPANCY SECTION === */}
      {hasDiscrepancy && (
        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Discrepancy Report</div>
          <div style={{ ...sectionBoxStyle, background: '#fef2f2', borderColor: '#fca5a5' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 14px', fontSize: 12, marginBottom: 8 }}>
              <span style={lbl}>Discrepancy:</span><span style={{ fontWeight: 700, color: '#dc2626' }}>YES</span>
              <span style={lbl}>Reported By:</span><span style={val}>{receivedBy || signatureName || '—'}</span>
              <span style={lbl}>Date Reported:</span><span style={val}>{fmtDateTime(updatedAt)}</span>
              {branchNote && <><span style={lbl}>Details:</span><span style={{ ...val, fontWeight: 400 }}>{branchNote}</span></>}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', marginBottom: 4 }}>Affected Items</div>
            {items.filter(it => {
              const qr = it.quantityReceived ?? it.quantity_received;
              const qa = it.quantityApproved ?? it.quantity_approved ?? it.quantity;
              return qr != null && Number(qr) !== Number(qa);
            }).map((it, i) => {
              const qa = Number(it.quantityApproved ?? it.quantity_approved ?? it.quantity);
              const qr = Number(it.quantityReceived ?? it.quantity_received ?? 0);
              return (
                <div key={i} style={{ display: 'flex', gap: 12, fontSize: 11, marginBottom: 2, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, minWidth: 140 }}>{it.productName || it.product_name}</span>
                  <span>Dispatched: {qa}</span>
                  <span>Received: {qr}</span>
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>Variance: {qr - qa}</span>
                  {(it.discrepancyNote || it.discrepancy_note) && <span style={{ color: '#64748b', fontSize: 10 }}>— {it.discrepancyNote || it.discrepancy_note}</span>}
                </div>
              );
            })}
            {items.filter(it => {
              const qr = it.quantityReceived ?? it.quantity_received;
              const qa = it.quantityApproved ?? it.quantity_approved ?? it.quantity;
              return qr != null && Number(qr) !== Number(qa);
            }).length === 0 && (
              <div style={{ fontSize: 11, color: '#dc2626' }}>{branchNote || 'General discrepancy reported — see branch notes above'}</div>
            )}
          </div>
        </div>
      )}

      {/* === G. SIGNATURES === */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginTop: 24, paddingTop: 14, borderTop: '2px solid #c41e3a' }}>
        <div>
          <div style={sigTitle}>Prepared By</div>
          <div style={sigName}>{createdBy || dispatchedBy || ''}</div>
          <div style={sigLine}></div>
          <div style={sigSub}>Signature / Date</div>
        </div>
        <div>
          <div style={sigTitle}>GM Approval</div>
          <div style={sigName}>{approvedBy || rejectedBy || ''}</div>
          <div style={sigLine}></div>
          <div style={sigSub}>Signature / Date</div>
        </div>
        <div>
          <div style={sigTitle}>Received By (Branch)</div>
          <div style={sigName}>{signatureName || receivedBy || ''}</div>
          <div style={sigLine}></div>
          <div style={sigSub}>Signature / Date</div>
        </div>
      </div>

      {/* === AUDIT FOOTER === */}
      <div style={{ marginTop: 18, paddingTop: 10, borderTop: '1px solid #e5e7eb', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 10, color: '#9ca3af' }}>
        <div>
          <div style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 9 }}>Prepared</div>
          <div>{fmtDateTime(createdAt)}</div>
          <div>By: {createdBy || '—'}{preparedByRole ? ` (${preparedByRole.replace(/_/g, ' ')})` : ''}</div>
        </div>
        <div>
          <div style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 9 }}>GM Approved</div>
          <div>{hasGMAction ? fmtDateTime(gmApprovedAt || amendedAt || updatedAt) : '—'}</div>
          <div>By: {gmApprovedBy || approvedBy || rejectedBy || '—'}</div>
        </div>
        <div>
          <div style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 9 }}>Received</div>
          <div>{hasReceipt ? fmtDateTime(updatedAt) : '—'}</div>
          <div>By: {receivedBy || '—'}</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16, paddingTop: 8, borderTop: '1px solid #e5e7eb', fontSize: 10, color: '#b0b0b0' }}>
        Dynapharm International Namibia • Dispatch Note {dispRef} • Generated {fmtDateTime(new Date().toISOString())}
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 900, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '14px 24px', borderBottom: '2px solid #c41e3a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, color: '#c41e3a', fontWeight: 800 }}>DISPATCH NOTE</h2>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{dispRef}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handlePrint} style={btnPrimary}>🖨️ Print / PDF</button>
            <button onClick={onClose} style={btnSecondary}>✕ Close</button>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          {renderDocument()}
        </div>
      </div>
    </div>
  );
}

const lbl = { fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase' };
const val = { fontSize: 12, fontWeight: 600, color: '#1a1a1a' };
const infoRow = { display: 'flex', justifyContent: 'space-between', marginBottom: 3 };
const sectionBox = { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fafafa' };
const sectionHead = { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#c41e3a', fontWeight: 700, marginBottom: 6, borderBottom: '1px solid #fecdd3', paddingBottom: 4 };
const sectionTitle = { fontSize: 11, fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, paddingBottom: 3, borderBottom: '1px solid #fecdd3' };
const sectionBoxStyle = { border: '1px solid #d1d5db', borderRadius: 6, padding: '10px 12px', background: '#fafafa' };
const sigTitle = { fontSize: 10, color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 };
const sigName = { fontSize: 12, fontWeight: 600, marginBottom: 2, minHeight: 16 };
const sigLine = { borderBottom: '1px solid #1a1a1a', height: 30, marginBottom: 4 };
const sigSub = { fontSize: 9, color: '#9ca3af' };
const btnPrimary = { padding: '8px 18px', background: '#c41e3a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13 };
const btnSecondary = { padding: '8px 18px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 };

function TH({ children, align = 'left' }) {
  return (
    <th style={{ background: '#c41e3a', color: 'white', padding: '7px 8px', textAlign: align, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>
      {children}
    </th>
  );
}

function TD({ children, align = 'left', style = {} }) {
  return (
    <td style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb', textAlign: align, fontSize: 11, ...style }}>
      {children}
    </td>
  );
}

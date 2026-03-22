import { useState, useRef, useEffect } from 'react';

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
  const barWidth = 1.5;
  const height = 50;
  let x = 0;
  let bars = '';
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === '1') {
      bars += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`;
    }
    x += barWidth;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${height + 16}" viewBox="0 0 ${x} ${height + 16}">
    ${bars}
    <text x="${x/2}" y="${height + 13}" text-anchor="middle" font-family="monospace" font-size="10">${value}</text>
  </svg>`;
}

const LOC_LABELS = {
  country_stock: 'Country Stock',
  windhoek_warehouse: 'Windhoek Warehouse',
  ondangwa_warehouse: 'Ondangwa Warehouse',
  windhoek_branch: 'Windhoek Branch',
  ondangwa_branch: 'Ondangwa Branch',
  oshakati_branch: 'Oshakati Branch',
  rundu_branch: 'Rundu Branch',
  tsumeb_branch: 'Tsumeb Branch',
  katima_branch: 'Katima Mulilo Branch',
  walvis_branch: 'Walvis Bay Branch',
  gobabis_branch: 'Gobabis Branch',
  otjiwarongo_branch: 'Otjiwarongo Branch',
  keetmanshoop_branch: 'Keetmanshoop Branch',
};

function fmtLoc(key) {
  if (!key) return '—';
  return LOC_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; }
}

function fmtDateTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
}

function statusBadge(status) {
  const colors = {
    pending_approval: { bg: '#fef3c7', color: '#92400e', label: 'Pending GM Approval' },
    approved: { bg: '#d1fae5', color: '#065f46', label: 'Approved' },
    rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
    received: { bg: '#dbeafe', color: '#1e40af', label: 'Received' },
    delivered: { bg: '#d1fae5', color: '#065f46', label: 'Delivered' },
    partially_received: { bg: '#fef3c7', color: '#92400e', label: 'Partially Received' },
    discrepancy_reported: { bg: '#fee2e2', color: '#991b1b', label: 'Discrepancy Reported' },
    returned: { bg: '#fce7f3', color: '#9d174d', label: 'Returned for Correction' },
    submitted: { bg: '#e0e7ff', color: '#3730a3', label: 'Submitted' },
  };
  const s = colors[status] || { bg: '#f3f4f6', color: '#374151', label: status };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

export default function DispatchNote({ transfer, onClose, mode = 'view' }) {
  const printRef = useRef(null);
  const barcodeValue = transfer?.dispatchNote?.barcode || transfer?.dispatchReference || transfer?.id || 'N/A';
  const barcodeSVG = generateBarcodeSVG(barcodeValue.slice(0, 30));

  const items = transfer?.items || [];
  const isAmended = transfer?.gmAction === 'amend_approve' || transfer?.metadata?.amended;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Dispatch Note - ${transfer?.id}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 20px; color: #1a1a1a; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #c41e3a; padding-bottom: 15px; }
        .header h1 { color: #c41e3a; font-size: 24px; margin-bottom: 5px; }
        .header h2 { font-size: 14px; color: #666; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
        .info-item { padding: 8px; border: 1px solid #e5e7eb; border-radius: 4px; }
        .info-label { font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 600; }
        .info-value { font-size: 14px; font-weight: 600; margin-top: 2px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #c41e3a; color: white; padding: 8px 10px; text-align: left; font-size: 12px; }
        td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
        tr:nth-child(even) { background: #f9fafb; }
        .sig-section { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; }
        .sig-box { border-bottom: 1px solid #333; padding-bottom: 30px; margin-bottom: 5px; }
        .sig-label { font-size: 11px; color: #666; }
        .barcode-box { text-align: center; margin: 15px 0; }
        .status-badge { display: inline-block; padding: 3px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
        .notes-section { margin: 15px 0; padding: 10px; border: 1px solid #e5e7eb; border-radius: 4px; min-height: 60px; }
        .notes-label { font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
        @media print { body { padding: 0; } }
      </style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 800, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#1a1a1a' }}>📄 Dispatch Note</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handlePrint} style={{ padding: '8px 16px', background: '#c41e3a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              🖨️ Print / PDF
            </button>
            <button onClick={onClose} style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              ✕ Close
            </button>
          </div>
        </div>

        <div ref={printRef} style={{ padding: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '3px solid #c41e3a', paddingBottom: 15 }}>
            <h1 style={{ color: '#c41e3a', fontSize: 24, margin: 0 }}>DYNAPHARM INTERNATIONAL NAMIBIA</h1>
            <h2 style={{ fontSize: 18, margin: '5px 0', color: '#333' }}>DISPATCH NOTE</h2>
            <p style={{ fontSize: 12, color: '#666' }}>Stock Transfer Document</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 4 }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Dispatch Reference</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{transfer?.dispatchReference || transfer?.id || '—'}</div>
            </div>
            <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 4 }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Status</div>
              <div style={{ marginTop: 4 }}>{statusBadge(transfer?.status)}</div>
            </div>
            <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 4 }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Source Warehouse</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{fmtLoc(transfer?.from_location || transfer?.fromWarehouse)}</div>
            </div>
            <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 4 }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Destination Branch</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{fmtLoc(transfer?.to_location || transfer?.toBranch)}</div>
            </div>
            <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 4 }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Dispatch Date</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{fmtDateTime(transfer?.dispatchedAt || transfer?.createdAt)}</div>
            </div>
            <div style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 4 }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Prepared By</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{transfer?.createdBy || transfer?.dispatchedBy || '—'}</div>
            </div>
          </div>

          {isAmended && (
            <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, padding: 10, marginBottom: 15, fontSize: 13 }}>
              <strong>⚠️ Amended by GM:</strong> {transfer?.amendedByGm || 'GM'} on {fmtDateTime(transfer?.amendedAt)}
              {transfer?.gmComment && <div style={{ marginTop: 4 }}><em>Comment: {transfer.gmComment}</em></div>}
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
            <thead>
              <tr>
                <th style={{ background: '#c41e3a', color: 'white', padding: '8px 10px', textAlign: 'left', fontSize: 12 }}>#</th>
                <th style={{ background: '#c41e3a', color: 'white', padding: '8px 10px', textAlign: 'left', fontSize: 12 }}>Product Name</th>
                <th style={{ background: '#c41e3a', color: 'white', padding: '8px 10px', textAlign: 'left', fontSize: 12 }}>Batch No.</th>
                <th style={{ background: '#c41e3a', color: 'white', padding: '8px 10px', textAlign: 'left', fontSize: 12 }}>Expiry Date</th>
                <th style={{ background: '#c41e3a', color: 'white', padding: '8px 10px', textAlign: 'right', fontSize: 12 }}>Qty Prepared</th>
                {isAmended && <th style={{ background: '#c41e3a', color: 'white', padding: '8px 10px', textAlign: 'right', fontSize: 12 }}>Qty Approved</th>}
                {(transfer?.receiptStatus || transfer?.status === 'delivered' || transfer?.status === 'received') && (
                  <th style={{ background: '#c41e3a', color: 'white', padding: '8px 10px', textAlign: 'right', fontSize: 12 }}>Qty Received</th>
                )}
                <th style={{ background: '#c41e3a', color: 'white', padding: '8px 10px', textAlign: 'left', fontSize: 12 }}>Unit</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20, color: '#9ca3af' }}>No items</td></tr>
              ) : items.map((item, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13 }}>{i + 1}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13, fontWeight: 500 }}>{item.productName || item.productId}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13 }}>{item.batchNo || '—'}</td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13, color: item.expiryDate && new Date(item.expiryDate) < new Date(Date.now() + 90*86400000) ? '#dc2626' : '#333' }}>
                    {item.expiryDate ? fmtDate(item.expiryDate) : '—'}
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13, textAlign: 'right', fontWeight: 600 }}>{item.quantity}</td>
                  {isAmended && (
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13, textAlign: 'right', fontWeight: 600, color: item.quantityApproved !== null && item.quantityApproved !== item.quantity ? '#dc2626' : '#333' }}>
                      {item.quantityApproved != null ? item.quantityApproved : item.quantity}
                    </td>
                  )}
                  {(transfer?.receiptStatus || transfer?.status === 'delivered' || transfer?.status === 'received') && (
                    <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13, textAlign: 'right', fontWeight: 600 }}>
                      {item.quantityReceived != null ? item.quantityReceived : '—'}
                    </td>
                  )}
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13 }}>{item.unit || 'units'}</td>
                </tr>
              ))}
              {items.length > 0 && (
                <tr style={{ background: '#f3f4f6', fontWeight: 700 }}>
                  <td colSpan={4} style={{ padding: '8px 10px', borderTop: '2px solid #d1d5db', fontSize: 13 }}>TOTAL</td>
                  <td style={{ padding: '8px 10px', borderTop: '2px solid #d1d5db', fontSize: 13, textAlign: 'right' }}>
                    {items.reduce((s, it) => s + (it.quantity || 0), 0)}
                  </td>
                  {isAmended && (
                    <td style={{ padding: '8px 10px', borderTop: '2px solid #d1d5db', fontSize: 13, textAlign: 'right' }}>
                      {items.reduce((s, it) => s + (it.quantityApproved != null ? it.quantityApproved : it.quantity || 0), 0)}
                    </td>
                  )}
                  {(transfer?.receiptStatus || transfer?.status === 'delivered' || transfer?.status === 'received') && (
                    <td style={{ padding: '8px 10px', borderTop: '2px solid #d1d5db', fontSize: 13, textAlign: 'right' }}>
                      {items.reduce((s, it) => s + (it.quantityReceived || 0), 0)}
                    </td>
                  )}
                  <td style={{ padding: '8px 10px', borderTop: '2px solid #d1d5db' }}></td>
                </tr>
              )}
            </tbody>
          </table>

          {transfer?.dispatchNotes && (
            <div style={{ margin: '15px 0', padding: 10, border: '1px solid #e5e7eb', borderRadius: 4 }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Dispatch Notes</div>
              <div style={{ fontSize: 13 }}>{transfer.dispatchNotes}</div>
            </div>
          )}

          {transfer?.branchReceiptNote && (
            <div style={{ margin: '15px 0', padding: 10, border: '1px solid #e5e7eb', borderRadius: 4 }}>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Branch Receipt Notes</div>
              <div style={{ fontSize: 13 }}>{transfer.branchReceiptNote}</div>
            </div>
          )}

          <div style={{ textAlign: 'center', margin: '20px 0' }}>
            <div dangerouslySetInnerHTML={{ __html: barcodeSVG }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginTop: 30, paddingTop: 15, borderTop: '1px solid #e5e7eb' }}>
            <div>
              <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Prepared By</div>
              <div style={{ borderBottom: '1px solid #333', paddingBottom: 25, marginBottom: 5 }}>
                {transfer?.createdBy || ''}
              </div>
              <div style={{ fontSize: 11, color: '#666' }}>Signature / Date</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>GM Approval</div>
              <div style={{ borderBottom: '1px solid #333', paddingBottom: 25, marginBottom: 5 }}>
                {transfer?.metadata?.approved_by || transfer?.amendedByGm || ''}
              </div>
              <div style={{ fontSize: 11, color: '#666' }}>Signature / Date</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Received By</div>
              <div style={{ borderBottom: '1px solid #333', paddingBottom: 25, marginBottom: 5 }}>
                {transfer?.signatureName || transfer?.receivedBy || ''}
              </div>
              <div style={{ fontSize: 11, color: '#666' }}>Signature / Date</div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 20, paddingTop: 10, borderTop: '1px solid #e5e7eb', fontSize: 11, color: '#9ca3af' }}>
            Dynapharm International Namibia • Dispatch Note • Generated {fmtDateTime(new Date().toISOString())}
          </div>
        </div>
      </div>
    </div>
  );
}

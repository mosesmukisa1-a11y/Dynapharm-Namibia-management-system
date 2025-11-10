const state = {
  catalogs: {
    products: [],
    distributors: [],
    branches: [],
  },
};

function normalizeFetchError(error) {
  return {
    success: false,
    error: error?.message || 'Network request failed',
  };
}

async function apiFetch(path, { method = 'GET', body } = {}) {
  const options = {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(path, options);
  if (!response.ok) {
    const message = `HTTP ${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }
  return null;
}

function normalizeLine(line) {
  if (!line) return null;
  const base = line.data && typeof line.data === 'object' ? line.data : {};
  const validation = line.validation && typeof line.validation === 'object' ? line.validation : {};
  return {
    id: line.id || base.id || line.line_uid || base.tempId || `LINE-${Date.now()}`,
    tempId: line.line_uid || base.tempId || `LINE-${Date.now()}`,
    distributorName: line.distributor_name || base.distributorName || '',
    distributorNb: line.distributor_code || base.distributorNb || '',
    sku: line.sku || base.sku || '',
    quantity: Number(line.quantity ?? base.quantity ?? 0),
    unitPrice: Number(line.unit_price ?? base.unitPrice ?? 0),
    branch: line.branch_id || base.branch || '',
    timestamp: line.sale_timestamp || base.timestamp || new Date().toISOString(),
    status: line.status || base.status || 'draft',
    validation: {
      distributor: validation.distributor ?? null,
      product: validation.product ?? null,
      notes: Array.isArray(validation.notes) ? validation.notes : [],
    },
  };
}

function normalizeDraft(draft) {
  if (!draft) return { id: `DRAFT-${Date.now()}`, branch: 'main', lines: [] };
  const payload =
    typeof draft.payload === 'object' && draft.payload !== null
      ? draft.payload
      : {};

  const lines = Array.isArray(draft.lines)
    ? draft.lines.map(normalizeLine).filter(Boolean)
    : Array.isArray(payload.lines)
      ? payload.lines.map(normalizeLine).filter(Boolean)
      : [];

  return {
    id: draft.id || payload.id || `DRAFT-${Date.now()}`,
    branch: draft.branch_id || payload.branch || 'main',
    status: draft.status || payload.status || 'draft',
    timestamp: draft.updated_at || payload.timestamp || new Date().toISOString(),
    totalAmount: Number(draft.total_amount ?? payload.totalAmount ?? 0),
    totalQuantity: Number(draft.total_quantity ?? payload.totalQuantity ?? 0),
    lines,
  };
}

export async function loadCatalogs() {
  try {
    const response = await apiFetch('/api/mis/catalogs');
    const catalogs = response?.catalogs || response || {};
    state.catalogs.products = Array.isArray(catalogs.products) ? catalogs.products : [];
    state.catalogs.distributors = Array.isArray(catalogs.distributors) ? catalogs.distributors : [];
    state.catalogs.branches = Array.isArray(catalogs.branches) ? catalogs.branches : [];
    return state.catalogs;
  } catch (error) {
    console.warn('loadCatalogs failed, using cached data', error);
    return state.catalogs;
  }
}

export function getBranches() {
  if (state.catalogs.branches.length === 0) {
    return [
      { id: 'all', name: 'All Branches' },
      { id: 'main', name: 'Main Branch' },
    ];
  }
  return state.catalogs.branches;
}

export async function createSalesDraft(draft, currentUser) {
  try {
    const payload = {
      draft,
      user: {
        username: currentUser?.username || null,
        fullName: currentUser?.fullName || null,
      },
    };
    const response = await apiFetch('/api/mis/drafts', {
      method: 'POST',
      body: payload,
    });
    return {
      success: true,
      data: normalizeDraft(response?.draft || response),
    };
  } catch (error) {
    console.error('createSalesDraft failed', error);
    return normalizeFetchError(error);
  }
}

export async function verifySalesLines(draft, ids, currentUser) {
  try {
    const response = await apiFetch('/api/mis/drafts', {
      method: 'PATCH',
      body: {
        action: 'verify',
        draftId: draft.id,
        lineIds: ids,
        user: {
          username: currentUser?.username || null,
          fullName: currentUser?.fullName || null,
        },
      },
    });
    return normalizeDraft(response?.draft || response);
  } catch (error) {
    console.error('verifySalesLines failed', error);
    return draft;
  }
}

export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text !== 'string') {
          resolve([]);
          return;
        }
        const rows = [];
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        if (lines.length === 0) {
          resolve([]);
          return;
        }
        const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
        for (let i = 1; i < lines.length; i += 1) {
          const line = lines[i];
          if (!line.trim()) continue;
          const columns = [];
          let current = '';
          let inQuotes = false;
          for (let j = 0; j < line.length; j += 1) {
            const ch = line[j];
            if (ch === '"') {
              if (inQuotes && line[j + 1] === '"') {
                current += '"';
                j += 1;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (ch === ',' && !inQuotes) {
              columns.push(current);
              current = '';
            } else {
              current += ch;
            }
          }
          columns.push(current);
          const row = {};
          headers.forEach((header, idx) => {
            row[header] = (columns[idx] || '').trim().replace(/^"|"$/g, '');
          });
          rows.push(row);
        }
        resolve(rows);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    } catch (error) {
      reject(error);
    }
  });
}

export async function getBranchSyncStatus(date) {
  try {
    const response = await apiFetch(`/api/mis/branch-status?date=${encodeURIComponent(date)}`);
    return response;
  } catch (error) {
    console.error('getBranchSyncStatus failed', error);
    return {
      pending: [],
      encoded: [],
      reconciliation: [],
    };
  }
}

export async function reconcilePeriod({ start, end }) {
  try {
    const response = await apiFetch('/api/mis/reconcile', {
      method: 'POST',
      body: { start, end },
    });
    return response?.rows || [];
  } catch (error) {
    console.error('reconcilePeriod failed', error);
    return [];
  }
}

export async function buildEncodedSalesReport({ start, end, branch }) {
  try {
    const query = new URLSearchParams();
    if (start) query.set('start', start);
    if (end) query.set('end', end);
    if (branch) query.set('branch', branch);
    const response = await apiFetch(`/api/mis/encoded-sales?${query.toString()}`);
    const rows = Array.isArray(response?.rows) ? response.rows : [];
    const headers = ['Branch', 'Distributor', 'SKU', 'Product', 'Quantity', 'Unit Price', 'Amount', 'Status'];
    const csvRows = rows.map((row) => [
      row.branch,
      row.distributorName,
      row.sku,
      row.productName,
      row.quantity,
      row.unitPrice,
      row.amount,
      row.status,
    ]);

    const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const totalQuantity = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

    const html = `
      <div style="font-family: Arial, sans-serif; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">Encoded Sales Report</h2>
        <p style="margin-top: 0; color: #6b7280;">Period: ${start || '---'} to ${end || '---'} • Branch: ${branch || 'All'}</p>
        <div style="background:#eef2ff; padding:12px; border-radius:8px; display:flex; gap:24px; margin-bottom:16px;">
          <div><strong>Total Quantity</strong><div style="font-size:1.25rem;">${totalQuantity.toFixed(2)}</div></div>
          <div><strong>Total Amount</strong><div style="font-size:1.25rem;">N$ ${totalAmount.toFixed(2)}</div></div>
          <div><strong>Records</strong><div style="font-size:1.25rem;">${rows.length}</div></div>
        </div>
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#f9fafb; text-align:left;">
              ${headers.map((h) => `<th style="padding:8px; border:1px solid #e5e7eb;">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr>
                    <td style="padding:8px; border:1px solid #e5e7eb;">${row.branch}</td>
                    <td style="padding:8px; border:1px solid #e5e7eb;">${row.distributorName || ''}</td>
                    <td style="padding:8px; border:1px solid #e5e7eb;">${row.sku || ''}</td>
                    <td style="padding:8px; border:1px solid #e5e7eb;">${row.productName || ''}</td>
                    <td style="padding:8px; border:1px solid #e5e7eb; text-align:right;">${Number(row.quantity || 0).toFixed(2)}</td>
                    <td style="padding:8px; border:1px solid #e5e7eb; text-align:right;">${Number(row.unitPrice || 0).toFixed(2)}</td>
                    <td style="padding:8px; border:1px solid #e5e7eb; text-align:right;">${Number(row.amount || 0).toFixed(2)}</td>
                    <td style="padding:8px; border:1px solid #e5e7eb;">${row.status || ''}</td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    const meta = {
      start,
      end,
      branch,
      generatedAt: new Date().toISOString(),
      totals: {
        totalAmount,
        totalQuantity,
        recordCount: rows.length,
      },
    };

    return {
      html,
      csvHeaders: headers,
      csvRows,
      meta,
    };
  } catch (error) {
    console.error('buildEncodedSalesReport failed', error);
    return {
      html: '<p style="color:#dc2626;">Failed to build report.</p>',
      csvHeaders: [],
      csvRows: [],
      meta: null,
    };
  }
}

export async function submitReport(payload, recipients = []) {
  try {
    const response = await apiFetch('/api/reports', {
      method: 'POST',
      body: {
        reportType: 'mis_encoded_sales',
        recipients,
        ...payload,
      },
    });
    return response;
  } catch (error) {
    console.error('submitReport failed', error);
    return normalizeFetchError(error);
  }
}

export async function getAuditLogs({ start, end, branch }) {
  try {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    if (branch) params.set('branch', branch);
    const response = await apiFetch(`/api/mis/audit?${params.toString()}`);
    return Array.isArray(response?.logs) ? response.logs : [];
  } catch (error) {
    console.error('getAuditLogs failed', error);
    return [];
  }
}

export function exportCsv(filename, headers, rows) {
  const headerLine = headers.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',');
  const bodyLines = rows.map((row) =>
    row
      .map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [headerLine, ...bodyLines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function getDailyReceipts(date) {
  try {
    const response = await apiFetch(`/api/mis/receipts?date=${encodeURIComponent(date)}`);
    return response;
  } catch (error) {
    console.error('getDailyReceipts failed', error);
    return { receipts: [], totals: {} };
  }
}

export async function getReceiptsByDateRange(start, end, branch) {
  try {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    if (branch && branch !== 'all') params.set('branch', branch);
    const response = await apiFetch(`/api/mis/receipts?${params.toString()}`);
    return response;
  } catch (error) {
    console.error('getReceiptsByDateRange failed', error);
    return { receipts: [], totals: {} };
  }
}

export async function getStockSoldPerBranch({ start, end, branch }) {
  try {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    if (branch && branch !== 'all') params.set('branch', branch);
    const response = await apiFetch(`/api/mis/stock?${params.toString()}`);
    return Array.isArray(response?.rows) ? response.rows : [];
  } catch (error) {
    console.error('getStockSoldPerBranch failed', error);
    return [];
  }
}

export async function getMonthlyStockSoldReport(year, month, branch) {
  try {
    const params = new URLSearchParams();
    params.set('year', String(year));
    params.set('month', String(month));
    if (branch && branch !== 'all') params.set('branch', branch);
    const response = await apiFetch(`/api/mis/stock?scope=monthly&${params.toString()}`);
    return Array.isArray(response?.rows) ? response.rows : [];
  } catch (error) {
    console.error('getMonthlyStockSoldReport failed', error);
    return [];
  }
}

export function exportStockSoldToExcel(data, filename) {
  if (!Array.isArray(data) || data.length === 0) {
    alert('No data available to export.');
    return;
  }
  const headers = ['Branch', 'Product', 'Quantity Sold', 'Amount (N$)'];
  const rows = data.map((row) => [
    row.branch,
    row.productName,
    Number(row.quantity || 0).toFixed(2),
    Number(row.amount || 0).toFixed(2),
  ]);
  exportCsv(filename.replace(/\.xlsx$/i, '.csv'), headers, rows);
}

export function exportDailyReceiptsToExcel(data, filename) {
  if (!Array.isArray(data) || data.length === 0) {
    alert('No data available to export.');
    return;
  }
  const headers = ['Receipt #', 'Type', 'Branch', 'Client', 'Date', 'Time', 'Amount (N$)', 'Items'];
  const rows = data.map((receipt) => [
    receipt.saleNumber || receipt.id,
    receipt.paymentMethod || receipt.type || '',
    receipt.branchId || receipt.branch || '',
    receipt.customerName || receipt.client || '',
    receipt.saleDate ? new Date(receipt.saleDate).toLocaleDateString() : '',
    receipt.saleDate ? new Date(receipt.saleDate).toLocaleTimeString() : '',
    Number(receipt.total || 0).toFixed(2),
    Array.isArray(receipt.items)
      ? receipt.items.map((item) => `${item.productName || item.name} (x${item.quantity || 0})`).join('; ')
      : '',
  ]);
  exportCsv(filename.replace(/\.xlsx$/i, '.csv'), headers, rows);
}



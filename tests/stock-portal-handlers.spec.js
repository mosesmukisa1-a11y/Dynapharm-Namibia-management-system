import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

const buildBaseDOM = () => `
  <div id="countryStockList"></div>
  <div id="countryInventoryTable"></div>
  <div id="importSummaryPanel" style="display:none;">
    <div id="importSummaryContent"></div>
  </div>
  <div id="pendingBranchRequests"></div>
  <div id="distributionHistoryList"></div>
  <div id="branchDistributionHistory"></div>
  <div id="shopVisibilityList"></div>
  <div id="warehouseSharingList"></div>
  <div id="automaticOrdersList"></div>
  <div id="manualOrdersList"></div>
  <div id="invoiceReportSummary"></div>
  <div id="invoiceReportTotalCount"></div>
  <div id="invoiceReportGrossSales"></div>
  <div id="invoiceReportRefunds"></div>
  <select id="invoiceReportBranch"></select>
  <select id="invoiceReportRange"><option value="monthly" selected>Monthly</option></select>
  <div>
    <table><tbody id="invoiceReportTableBody"></tbody></table>
  </div>
`;

const setupTestEnv = async () => {
  const dom = new JSDOM(`<!doctype html><html><body>${buildBaseDOM()}</body></html>`, {
    url: 'http://localhost'
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;
  global.CustomEvent = dom.window.CustomEvent;
  global.Event = dom.window.Event;
  window.fetch = vi.fn(async () => {
    const headers = new window.Headers({ 'content-type': 'application/json' });
    return {
      ok: true,
      headers,
      json: async () => [],
      text: async () => '[]'
    };
  });
  window.showToast = vi.fn();
  window.alert = vi.fn();
  vi.resetModules();
  await import('../assets/js/stock-portal-handlers.js');
  window.StockPortalHandlers.initialized = false;
  window.StockPortalHandlers.init();
  window.StockPortalHandlers.renderAll();
};

describe('stock-portal-handlers', () => {
  beforeEach(async () => {
    await setupTestEnv();
  });

  it('seeds default data on init', () => {
    const data = window.StockPortalHandlers.loadStockData();
    expect(Array.isArray(data.country)).toBe(true);
    expect(data.country.length).toBeGreaterThan(0);
    expect(window.countryStock.length).toBeGreaterThan(0);
  });

  it('handles bulk country import submissions', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <table>
        <tbody data-stock-import-body="true">
          <tr>
            <td><input class="stock-carton-no" value="A1-01"></td>
            <td><input class="stock-description" value="TEST PRODUCT"></td>
            <td><input class="stock-batch-no" value="TP-001"></td>
            <td><input class="stock-expiry-date" type="month" value="2026-10"></td>
            <td><input class="stock-quantity" type="number" value="50"></td>
            <td><input class="stock-total-ctns" type="number" value="5"></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    `;
    document.body.appendChild(form);
    window.handleBulkStockImportSubmit({
      preventDefault: () => {},
      target: form
    });
    const imported = window.countryStock.find((item) => item.description === 'TEST PRODUCT');
    expect(imported).toBeTruthy();
    expect(imported.quantity).toBe(50);
    const summary = document.getElementById('importSummaryPanel');
    expect(summary.style.display).toBe('block');
  });

  it('keeps separate batches for the same product during country import', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <table>
        <tbody data-stock-import-body="true">
          <tr>
            <td><input class="stock-carton-no" value="A1-01"></td>
            <td><input class="stock-description" value="BATCHED PRODUCT"></td>
            <td><input class="stock-batch-no" value="BATCH-001"></td>
            <td><input class="stock-expiry-date" type="month" value="2026-10"></td>
            <td><input class="stock-quantity" type="number" value="10"></td>
            <td><input class="stock-total-ctns" type="number" value="1"></td>
            <td></td>
          </tr>
          <tr>
            <td><input class="stock-carton-no" value="A1-02"></td>
            <td><input class="stock-description" value="BATCHED PRODUCT"></td>
            <td><input class="stock-batch-no" value="BATCH-002"></td>
            <td><input class="stock-expiry-date" type="month" value="2026-12"></td>
            <td><input class="stock-quantity" type="number" value="15"></td>
            <td><input class="stock-total-ctns" type="number" value="2"></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    `;

    document.body.appendChild(form);

    window.handleBulkStockImportSubmit({
      preventDefault: () => {},
      target: form
    });

    const matches = window.countryStock.filter(
      (item) => item.description === 'BATCHED PRODUCT'
    );

    expect(matches).toHaveLength(2);
    expect(matches.map((item) => item.batchNo).sort()).toEqual(['BATCH-001', 'BATCH-002']);
    const batch1 = matches.find((item) => item.batchNo === 'BATCH-001');
    const batch2 = matches.find((item) => item.batchNo === 'BATCH-002');
    expect(batch1.quantity).toBe(10);
    expect(batch2.quantity).toBe(15);
  });

  it('parses CSV imports even when total cartons column is missing', () => {
    const csv = `Cartons No.,Description,Batch No.,Expiry Date,Quantity\n`
      + `A1,CSV PRODUCT,B-123,2026-05-01,25`;
    const { valid, rows } = window.StockPortalHandlers.parseImportCsv(csv);
    expect(valid).toBe(true);
    expect(rows).toEqual([
      {
        cartonNo: 'A1',
        description: 'CSV PRODUCT',
        batchNo: 'B-123',
        expiryDate: '2026-05',
        quantity: '25',
        totalCtns: '25'
      }
    ]);
  });

  it('populates rows from parsed CSV data into the import form', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <table>
        <tbody data-stock-import-body="true"></tbody>
      </table>
    `;
    const rows = [
      {
        cartonNo: 'BX-9',
        description: 'CSV POPULATED',
        batchNo: 'CSV-01',
        expiryDate: '2025-09',
        quantity: '12',
        totalCtns: '3'
      }
    ];
    window.StockPortalHandlers.populateImportRows(form, rows);
    const inputs = form.querySelectorAll('tbody tr input');
    expect(inputs.length).toBe(6);
    expect(form.querySelector('.stock-description').value).toBe('CSV POPULATED');
    expect(form.querySelector('.stock-total-ctns').value).toBe('3');
  });

  it('distributes warehouse stock to a branch and resolves requests', () => {
    const distForm = document.createElement('form');
    distForm.innerHTML = `
      <select id="branchDistSourceWarehouse">
        <option value="windhoek" selected>Windhoek</option>
      </select>
      <select id="branchDistDestination">
        <option value="townshop" selected>Townshop</option>
      </select>
      <select id="branchDistProduct">
        <option value="SPIRULINA TABLET (300's)" selected>SPIRULINA TABLET (300's)</option>
      </select>
      <input id="branchDistQuantity" type="number" value="5" />
      <select id="branchDistPriority"><option value="urgent" selected>urgent</option></select>
      <textarea id="branchDistNotes">urgent top-up</textarea>
    `;
    document.body.appendChild(distForm);
    window.handleBranchDistribution({
      preventDefault: () => {},
      target: distForm
    });
    const branchStock = JSON.parse(localStorage.getItem('dyna_branch_stock_v2'));
    expect(branchStock.townshop).toBeDefined();
    const spirulina = branchStock.townshop.find(
      (item) => item.description === "SPIRULINA TABLET (300's)"
    );
    expect(spirulina.quantity).toBeGreaterThanOrEqual(5);
    const requests = JSON.parse(localStorage.getItem('dyna_branch_requests_v1'));
    const resolved = requests.find((req) => req.id === 'REQ-BR-0001');
    expect(resolved.status).toBe('completed');
  });

  it('prevents partial depletion when distribution stock is insufficient', () => {
    const before = JSON.parse(localStorage.getItem('dyna_warehouse_stock_v2'));
    const originalQty = before.windhoek.find((item) => item.description === "SPIRULINA TABLET (300's)").quantity;
    const result = window.StockPortalHandlers.moveBetweenLocations(
      'warehouse:windhoek',
      'branch:townshop',
      "SPIRULINA TABLET (300's)",
      originalQty + 50
    );
    expect(result.ok).toBe(false);
    const after = JSON.parse(localStorage.getItem('dyna_warehouse_stock_v2'));
    const currentQty = after.windhoek.find((item) => item.description === "SPIRULINA TABLET (300's)").quantity;
    expect(currentQty).toBe(originalQty);
  });

  it('adds sharing rules via the sharing form handler', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <select id="sharingFrom">
        <option value="warehouse:windhoek" selected>Windhoek Warehouse</option>
      </select>
      <select id="sharingTo">
        <option value="branch:townshop" selected>Townshop</option>
      </select>
      <select id="sharingAccessLevel">
        <option value="view" selected>View</option>
      </select>
      <select id="sharingStatus">
        <option value="active" selected>Active</option>
      </select>
    `;
    document.body.appendChild(form);
    window.handleSharingRule({
      preventDefault: () => {},
      target: form
    });
    const rules = JSON.parse(localStorage.getItem('dyna_sharing_rules_v1'));
    const match = rules.find(
      (rule) => rule.from === 'warehouse:windhoek' && rule.to === 'branch:townshop'
    );
    expect(match).toBeTruthy();
  });

  it('renders invoice reports with filtered data', () => {
    const invoices = [
      {
        id: 'INV-1',
        number: 'INV-1',
        client: 'Client One',
        branch: 'Townshop HQ',
        amount: 500,
        channel: 'walk-in',
        date: new Date().toISOString(),
        refunded: 0
      },
      {
        id: 'INV-2',
        number: 'INV-2',
        client: 'Client Two',
        branch: 'Swakopmund',
        amount: 725,
        channel: 'online',
        date: new Date().toISOString(),
        refunded: 50
      }
    ];
    window.StockPortalHandlers.setInvoices(invoices);
    window.renderInvoiceReports();
    const tbody = document.getElementById('invoiceReportTableBody');
    expect(tbody.querySelectorAll('tr').length).toBe(2);
    expect(document.getElementById('invoiceReportTotalCount').textContent).toBe('2');
    expect(document.getElementById('invoiceReportGrossSales').textContent).toContain('N$');
  });
});


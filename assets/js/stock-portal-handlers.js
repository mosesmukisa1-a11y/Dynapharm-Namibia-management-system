/**
 * Dynapharm Stock Portal Handlers
 *
 * This module wires up the interactive Stock Portal experience so that every CTA
 * (buttons, selects, refresh actions) performs real work with real data.
 *
 * The implementation relies on browser storage (localStorage) to keep the demo
 * experience fully client-side while still mimicking production workflows.
 */
(function stockPortalHandlers(window, document) {
  'use strict';

  if (!window || !document) return;

  const STORAGE_KEYS = {
    countryStock: 'dyna_country_stock_v2',
    warehouseStock: 'dyna_warehouse_stock_v2',
    branchStock: 'dyna_branch_stock_v2',
    qualityChecks: 'dyna_quality_checks_v1',
    distributionHistory: 'dyna_distribution_history_v1',
    inventoryMovements: 'dyna_inventory_movements_v1',
    transfers: 'dyna_stock_transfers_v2',
    invoices: 'dyna_invoice_records_v1',
    sharingRules: 'dyna_sharing_rules_v1',
    branchRequests: 'dyna_branch_requests_v1',
    asnQueue: 'dyna_asn_queue_v1',
    putawayQueue: 'dyna_putaway_queue_v1',
    warehouseCapacity: 'dyna_warehouse_capacity_v1',
    replenishment: 'dyna_replenishment_suggestions_v1',
    returnsQueue: 'dyna_returns_queue_v1',
    routeBoard: 'dyna_route_board_v1',
    inventoryAlerts: 'dyna_inventory_alerts_v1',
    reorderPlans: 'dyna_reorder_plans_v1'
  };

  const DEFAULT_BRANCH_LIST = [
    { id: 'townshop', name: 'Townshop HQ' },
    { id: 'khomasdal', name: 'Khomasdal' },
    { id: 'swakopmund', name: 'Swakopmund' },
    { id: 'rundu', name: 'Rundu' },
    { id: 'walvisbay', name: 'Walvis Bay' }
  ];

  const DEFAULTS = {
    countryStock: [
      {
        id: 'country-alfalfa',
        description: 'DI LIQUID ALFALFA 500ml',
        batchNo: 'ALF-2501',
        expiryDate: '2026-09',
        quantity: 140,
        totalCtns: 14,
        unitCost: 95,
        location: 'country'
      },
      {
        id: 'country-spirulina',
        description: "SPIRULINA TABLET (300's)",
        batchNo: 'SPI-2499',
        expiryDate: '2027-01',
        quantity: 220,
        totalCtns: 22,
        unitCost: 80,
        location: 'country'
      },
      {
        id: 'country-noni',
        description: 'D.I NONI 500ml',
        batchNo: 'NONI-2502',
        expiryDate: '2026-06',
        quantity: 90,
        totalCtns: 9,
        unitCost: 120,
        location: 'country'
      }
    ],
    warehouseStock: {
      windhoek: [
        {
          id: 'windhoek-spirulina',
          description: "SPIRULINA TABLET (300's)",
          batchNo: 'SPI-WH-24',
          expiryDate: '2026-12',
          quantity: 60,
          unitCost: 82
        },
        {
          id: 'windhoek-ganoderma',
          description: 'GANODERMA LOTION 150ML',
          batchNo: 'GAN-2410',
          expiryDate: '2026-04',
          quantity: 35,
          unitCost: 70
        }
      ],
      ondangwa: [
        {
          id: 'ondangwa-alfalfa',
          description: 'DI LIQUID ALFALFA 500ml',
          batchNo: 'ALF-ON-24',
          expiryDate: '2026-02',
          quantity: 40,
          unitCost: 95
        }
      ]
    },
    branchStock: {
      townshop: [
        { description: 'DI LIQUID ALFALFA 500ml', quantity: 18 },
        { description: "SPIRULINA TABLET (300's)", quantity: 22 }
      ],
      swakopmund: [{ description: 'GANODERMA LOTION 150ML', quantity: 12 }]
    },
    qualityChecks: [
      {
        id: 'qc-alfalfa',
        batch: 'ALF-2501',
        reference: 'ASN-8891',
        date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        temperature: 'ambient',
        visual: 'Pass',
        docs: 'Complete',
        disposition: 'Released',
        notes: 'Batch cleared with FEFO tagging.'
      }
    ],
    distributionHistory: [
      {
        id: 'dist-1',
        date: new Date(Date.now() - 3600 * 1000 * 20).toISOString(),
        warehouse: 'Windhoek Warehouse',
        branch: 'Townshop HQ',
        product: "SPIRULINA TABLET (300's)",
        quantity: 20,
        notes: 'Restock before weekend promo.'
      }
    ],
    inventoryMovements: [
      {
        id: 'mv-1',
        type: 'import',
        product: 'DI LIQUID ALFALFA 500ml',
        quantity: 140,
        location: 'country',
        date: new Date(Date.now() - 86400000 * 2).toISOString(),
        details: 'Supplier ASN-8891'
      },
      {
        id: 'mv-2',
        type: 'distribution',
        product: "SPIRULINA TABLET (300's)",
        quantity: 20,
        location: 'branch:townshop',
        date: new Date(Date.now() - 3600 * 1000 * 20).toISOString(),
        details: 'Windhoek ➜ Townshop HQ'
      }
    ],
    transfers: [],
    invoices: [
      {
        id: 'inv-2025-0001',
        number: 'INV-2025-0001',
        client: 'Walk-in Client',
        branch: 'Townshop HQ',
        amount: 2350,
        channel: 'walk-in',
        date: new Date(Date.now() - 86400000 * 3).toISOString(),
        refunded: 0
      },
      {
        id: 'inv-2025-0002',
        number: 'INV-2025-0002',
        client: 'Online Order #1198',
        branch: 'Swakopmund',
        amount: 1890,
        channel: 'online',
        date: new Date(Date.now() - 86400000 * 5).toISOString(),
        refunded: 0
      },
      {
        id: 'inv-2025-0003',
        number: 'INV-2025-0003',
        client: 'Consultant Sale - Geneva',
        branch: 'Townshop HQ',
        amount: 980,
        channel: 'consultant',
        date: new Date(Date.now() - 86400000 * 7).toISOString(),
        refunded: 150
      }
    ],
    sharingRules: [
      {
        id: 'share-1',
        from: 'warehouse:windhoek',
        to: 'branch:townshop',
        accessLevel: 'transfer',
        status: 'active',
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString()
      },
      {
        id: 'share-2',
        from: 'warehouse:ondangwa',
        to: 'branch:swakopmund',
        accessLevel: 'view',
        status: 'active',
        createdAt: new Date(Date.now() - 86400000 * 6).toISOString()
      }
    ],
    branchRequests: [
      {
        id: 'REQ-BR-0001',
        branch: 'townshop',
        product: "SPIRULINA TABLET (300's)",
        quantity: 30,
        priority: 'urgent',
        status: 'pending',
        createdAt: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: 'REQ-BR-0002',
        branch: 'swakopmund',
        product: 'GANODERMA LOTION 150ML',
        quantity: 12,
        priority: 'normal',
        status: 'pending',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
      }
    ],
    asnQueue: [
      {
        id: 'ASN-8891',
        supplier: 'Dynapharm Malaysia',
        cartons: 42,
        pallets: 6,
        eta: new Date(Date.now() + 86400000 * 4).toISOString().slice(0, 10),
        status: 'In transit'
      },
      {
        id: 'ASN-8892',
        supplier: 'Dynapharm South Africa',
        cartons: 24,
        pallets: 3,
        eta: new Date(Date.now() + 86400000 * 9).toISOString().slice(0, 10),
        status: 'Awaiting documents'
      }
    ],
    putawayQueue: [
      {
        id: 'PUT-2401',
        warehouse: 'Windhoek',
        zone: 'Ambient A2',
        pallets: 4,
        priority: 'High'
      },
      {
        id: 'PUT-2402',
        warehouse: 'Ondangwa',
        zone: 'Chill C1',
        pallets: 2,
        priority: 'Normal'
      }
    ],
    returnsQueue: [
      {
        id: 'RET-102',
        branch: 'Swakopmund',
        product: 'GANODERMA LOTION 150ML',
        quantity: 3,
        reason: 'Damaged carton',
        status: 'Awaiting QA'
      }
    ],
    routeBoard: [
      {
        id: 'route-windhoek-rundu',
        vehicle: 'Truck 4T - DNP 5124',
        driver: 'Tomas',
        origin: 'Windhoek',
        destination: 'Rundu',
        eta: 'Today 16:00',
        status: 'On route'
      },
      {
        id: 'route-windhoek-walvis',
        vehicle: 'Sprinter - DNP 4188',
        driver: 'Maria',
        origin: 'Windhoek',
        destination: 'Walvis Bay',
        eta: 'Today 13:30',
        status: 'Loading'
      }
    ],
    inventoryAlerts: [
      {
        id: 'alert-low-spirulina',
        severity: 'warning',
        message: "Spirulina (Windhoek) below safety stock",
        action: 'Trigger replenishment'
      },
      {
        id: 'alert-expiry-noni',
        severity: 'info',
        message: 'Noni batch NONI-2502 expires in 75 days',
        action: 'Prioritize branch promotions'
      }
    ],
    reorderPlans: [
      {
        id: 'plan-spirulina',
        product: "SPIRULINA TABLET (300's)",
        scenario: 'Maintain promo buffers',
        recommendation: 'Order 220 units',
        impact: '+12 days cover'
      },
      {
        id: 'plan-noni',
        product: 'D.I NONI 500ml',
        scenario: 'Country push campaign',
        recommendation: 'Order 150 units',
        impact: '+18 days cover'
      }
    ]
  };

  const RAW_API_BASE =
    (window.API_BASE || window.API_BASE_URL || window.__API_BASE_URL__ || '/api') ?? '/api';
  const API_BASE = RAW_API_BASE.endsWith('/') ? RAW_API_BASE.slice(0, -1) : RAW_API_BASE;

  async function apiRequest(path, { method = 'GET', body, fallback = null } = {}) {
    if (!window.fetch || !path) return fallback;
    try {
      const response = await window.fetch(`${API_BASE}${path}`, {
        method,
        credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed: ${response.status}`);
      }
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await response.json();
      }
      return await response.text();
    } catch (error) {
      console.debug('Stock portal API request failed:', path, error.message);
      return fallback;
    }
  }

  const StockPortal = {
    initialized: false,
    initScheduled: false,
    readyQueue: [],
    data: {},
    state: {
      countrySearch: '',
      windhoekSearch: '',
      windhoekLowStockOnly: false,
      distributionSearch: '',
      inventoryFilters: {
        location: 'all',
        movement: 'all',
        product: '',
        from: '',
        to: ''
      },
      invoiceSearch: '',
      invoiceSearchTimer: null,
      invoiceSelection: new Set(),
      warehouseFilter: null // 'ondangwa' or 'windhoek'
    },
    syncingBackend: false,

    setWarehouseFilter(warehouse) {
      this.state.warehouseFilter = warehouse || null;
      if (warehouse) {
        localStorage.setItem('dyna_warehouse_filter', warehouse);
        console.log(`🏭 Warehouse filter set to: ${warehouse}`);
        // Re-render all views with warehouse filter
        this.renderAll();
      } else {
        localStorage.removeItem('dyna_warehouse_filter');
      }
    },

    getWarehouseFilter() {
      return this.state.warehouseFilter || localStorage.getItem('dyna_warehouse_filter') || null;
    },

    filterByWarehouse(data) {
      const warehouse = this.getWarehouseFilter();
      if (!warehouse || !data) return data;
      
      if (Array.isArray(data)) {
        return data.filter(item => {
          const location = (item.location || item.warehouse || '').toLowerCase();
          return location.includes(warehouse.toLowerCase());
        });
      }
      
      if (typeof data === 'object') {
        // For warehouse stock objects, return only the relevant warehouse
        if (warehouse === 'ondangwa' && data.ondangwa) {
          return { ondangwa: data.ondangwa };
        } else if (warehouse === 'windhoek' && data.windhoek) {
          return { windhoek: data.windhoek };
        }
      }
      
      return data;
    },

    ensureInit() {
      if (this.initScheduled) return;
      this.initScheduled = true;
      const boot = () => {
        if (this.initialized) return;
        this.init();
        const queue = [...this.readyQueue];
        this.readyQueue = [];
        queue.forEach((cb) => {
          try {
            cb();
          } catch (error) {
            console.warn('StockPortal ready callback error', error);
          }
        });
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
      } else {
        window.setTimeout(boot, 0);
      }
    },

    onReady(callback) {
      if (this.initialized) {
        callback();
      } else {
        this.readyQueue.push(callback);
        this.ensureInit();
      }
    },

    init() {
      this.initialized = true;
      this.seedDefaults();
      this.refreshFromStorage();
      this.populateSharingLocations();
      this.loadBranchesForDistribution();
      this.populateTransferBranchOptions();
      this.populateBranchDistributionProducts();
      this.loadWindhoekProducts();
      this.loadOndangwaProducts();
      this.loadTransferFromProducts();
      this.renderAll();
      this.installHelpModal();
      this.syncFromBackend()?.catch(() => {});
    },

    seedDefaults() {
      Object.entries(DEFAULTS).forEach(([key, value]) => {
        const storageKey = STORAGE_KEYS[key];
        if (!storageKey) return;
        try {
          const existing = localStorage.getItem(storageKey);
          if (!existing) {
            localStorage.setItem(storageKey, JSON.stringify(value));
          }
        } catch (error) {
          console.warn('Unable to seed stock portal defaults for', storageKey, error);
        }
      });
    },

    refreshFromStorage() {
      this.data.country = this.readStorage(STORAGE_KEYS.countryStock, DEFAULTS.countryStock);
      this.data.warehouses = this.readStorage(STORAGE_KEYS.warehouseStock, DEFAULTS.warehouseStock);
      this.data.branches = this.readStorage(STORAGE_KEYS.branchStock, DEFAULTS.branchStock);
      this.data.quality = this.readStorage(STORAGE_KEYS.qualityChecks, DEFAULTS.qualityChecks);
      this.data.distribution = this.readStorage(STORAGE_KEYS.distributionHistory, DEFAULTS.distributionHistory);
      this.data.movements = this.readStorage(STORAGE_KEYS.inventoryMovements, DEFAULTS.inventoryMovements);
      this.data.transfers = this.readStorage(STORAGE_KEYS.transfers, DEFAULTS.transfers);
      this.data.invoices = this.readStorage(STORAGE_KEYS.invoices, DEFAULTS.invoices);
      this.data.sharing = this.readStorage(STORAGE_KEYS.sharingRules, DEFAULTS.sharingRules);
      this.data.branchRequests = this.readStorage(STORAGE_KEYS.branchRequests, DEFAULTS.branchRequests);

      window.countryStock = this.clone(this.data.country);
      window.windhoekStock = this.clone((this.data.warehouses || {}).windhoek || []);
      window.ondangwaStock = this.clone((this.data.warehouses || {}).ondangwa || []);
    },

    renderAll() {
      this.refreshFromStorage();
      this.displayCountryStock();
      this.displayWindhoekStock();
      this.displayOndangwaStock();
      this.displayCountryStockInventory();
      this.renderCountryTotals();
      this.renderWarehouseSummaries();
      this.renderQualityList();
      this.renderBranchRequests();
      this.displayDistributionHistory();
      this.displayInventoryMovements();
      const range = document.getElementById('inventoryTimelyRange')?.value || 'monthly';
      this.renderInventoryTimelyReport(range);
      this.renderAutomaticOrdersList();
      this.renderManualOrdersList();
      this.renderInvoiceReports();
      this.loadShopWarehouseSharing();
    },

    loadStockData() {
      this.ensureInit();
      this.onReady(() => this.renderAll());
      return {
        country: this.clone(this.data.country || []),
        warehouses: this.clone(this.data.warehouses || {}),
        branches: this.clone(this.data.branches || {})
      };
    },

    saveStockData() {
      this.onReady(() => {
        this.writeStorage(STORAGE_KEYS.countryStock, this.data.country || []);
        this.writeStorage(STORAGE_KEYS.warehouseStock, this.data.warehouses || {});
        this.writeStorage(STORAGE_KEYS.branchStock, this.data.branches || {});
        window.countryStock = this.clone(this.data.country || []);
        window.windhoekStock = this.clone((this.data.warehouses || {}).windhoek || []);
        window.ondangwaStock = this.clone((this.data.warehouses || {}).ondangwa || []);
      });
    },

    /* ----------------------------------------------------------------------- */
    /* Storage helpers                                                         */
    /* ----------------------------------------------------------------------- */
    readStorage(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return this.clone(fallback);
        return JSON.parse(raw);
      } catch (error) {
        return this.clone(fallback);
      }
    },

    writeStorage(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.warn('StockPortal storage write failed', key, error);
      }
    },

    clone(value) {
      if (value === null || value === undefined) return value;
      if (typeof value !== 'object') return value;
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_) {
        return value;
      }
    },

    formatCurrency(value, currency = 'N$') {
      const num = Number(value || 0);
      return `${currency} ${num.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })}`;
    },

    escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    notify(message, variant = 'info') {
      if (typeof window.notifyStock === 'function') {
        window.notifyStock(message, variant);
      } else if (typeof window.showToast === 'function') {
        window.showToast(message, variant);
      } else {
        console.log(`[StockPortal:${variant}] ${message}`);
      }
    },

    createId(prefix) {
      return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    },

    resolveForm(trigger) {
      if (trigger?.closest) {
        const form = trigger.closest('.stock-import-form') || trigger.closest('form');
        if (form) return form;
      }
      return document.querySelector('.stock-import-form');
    },

    /* ----------------------------------------------------------------------- */
    /* Data getters & setters                                                  */
    /* ----------------------------------------------------------------------- */
    getCountryStock() {
      return this.clone(this.data.country || []);
    },

    setCountryStock(list) {
      const sanitized = Array.isArray(list)
        ? list.map((item) => ({
            id: item.id || this.createId('country'),
            description: item.description || item.product || 'Product',
            batchNo: item.batchNo || item.batch || '',
            expiryDate: item.expiryDate || item.expiry || '',
            quantity: Number(item.quantity ?? item.totalCtns ?? 0) || 0,
            totalCtns: Number(item.totalCtns ?? item.quantity ?? 0) || 0,
            unitCost: Number(item.unitCost || 0),
            location: 'country'
          }))
        : [];
      this.data.country = sanitized;
      this.writeStorage(STORAGE_KEYS.countryStock, sanitized);
      window.countryStock = this.clone(sanitized);
    },

    getWarehouseStock() {
      return this.clone(this.data.warehouses || { windhoek: [], ondangwa: [] });
    },

    setWarehouseStock(obj) {
      const normalized = obj || {};
      normalized.windhoek = Array.isArray(normalized.windhoek) ? normalized.windhoek : [];
      normalized.ondangwa = Array.isArray(normalized.ondangwa) ? normalized.ondangwa : [];
      normalized.windhoek = normalized.windhoek.map((item) => ({
        id: item.id || this.createId('windhoek'),
        description: item.description || item.product || 'Product',
        batchNo: item.batchNo || '',
        expiryDate: item.expiryDate || '',
        quantity: Number(item.quantity || 0),
        unitCost: Number(item.unitCost || 0)
      }));
      normalized.ondangwa = normalized.ondangwa.map((item) => ({
        id: item.id || this.createId('ondangwa'),
        description: item.description || item.product || 'Product',
        batchNo: item.batchNo || '',
        expiryDate: item.expiryDate || '',
        quantity: Number(item.quantity || 0),
        unitCost: Number(item.unitCost || 0)
      }));
      this.data.warehouses = normalized;
      this.writeStorage(STORAGE_KEYS.warehouseStock, normalized);
      window.windhoekStock = this.clone(normalized.windhoek);
      window.ondangwaStock = this.clone(normalized.ondangwa);
    },

    getBranchStock() {
      return this.clone(this.data.branches || {});
    },

    setBranchStock(map) {
      this.data.branches = map || {};
      this.writeStorage(STORAGE_KEYS.branchStock, this.data.branches);
    },

    getQualityLog() {
      return this.clone(this.data.quality || []);
    },

    setQualityLog(list) {
      this.data.quality = Array.isArray(list) ? list : [];
      this.writeStorage(STORAGE_KEYS.qualityChecks, this.data.quality);
    },

    getDistributionHistory() {
      return this.clone(this.data.distribution || []);
    },

    setDistributionHistory(list) {
      this.data.distribution = Array.isArray(list) ? list : [];
      this.writeStorage(STORAGE_KEYS.distributionHistory, this.data.distribution);
    },

    getInventoryMovements() {
      return this.clone(this.data.movements || []);
    },

    setInventoryMovements(list) {
      const entries = Array.isArray(list) ? list : [];
      entries.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      this.data.movements = entries.slice(0, 300);
      this.writeStorage(STORAGE_KEYS.inventoryMovements, this.data.movements);
    },

    getTransfers() {
      return this.clone(this.data.transfers || []);
    },

    setTransfers(list) {
      this.data.transfers = Array.isArray(list) ? list : [];
      this.writeStorage(STORAGE_KEYS.transfers, this.data.transfers);
    },

    getInvoices() {
      return this.clone(this.data.invoices || []);
    },

    setInvoices(list) {
      this.data.invoices = Array.isArray(list) ? list : [];
      this.writeStorage(STORAGE_KEYS.invoices, this.data.invoices);
    },

    getSharingRules() {
      return this.clone(this.data.sharing || []);
    },

    setSharingRules(list) {
      this.data.sharing = Array.isArray(list) ? list : [];
      this.writeStorage(STORAGE_KEYS.sharingRules, this.data.sharing);
    },

    getBranchRequests() {
      return this.clone(this.data.branchRequests || []);
    },

    setBranchRequests(list) {
      this.data.branchRequests = Array.isArray(list) ? list : [];
      this.writeStorage(STORAGE_KEYS.branchRequests, this.data.branchRequests);
    },

    async syncFromBackend() {
      if (this.syncingBackend) return;
      this.syncingBackend = true;
      try {
        const batches = await apiRequest('/stock-batches', { fallback: [] });
        if (Array.isArray(batches) && batches.length) {
          this.applyBackendBatches(batches);
        }

        const transfersResp = await apiRequest('/stock/transfers?status=all&limit=200', { fallback: null });
        const backendTransfers = Array.isArray(transfersResp?.transfers)
          ? transfersResp.transfers
          : Array.isArray(transfersResp)
          ? transfersResp
          : [];
        if (backendTransfers.length) {
          this.setTransfers(this.normalizeBackendTransfers(backendTransfers));
        }

        const requestsResp = await apiRequest('/stock-requests?status=pending', { fallback: null });
        const backendRequests = Array.isArray(requestsResp?.requests)
          ? requestsResp.requests
          : Array.isArray(requestsResp)
          ? requestsResp
          : [];
        if (backendRequests.length) {
          this.setBranchRequests(this.normalizeBackendRequests(backendRequests));
        }
      } finally {
        this.syncingBackend = false;
      }
    },

    applyBackendBatches(batches) {
      const country = [];
      const warehouses = { windhoek: [], ondangwa: [] };
      const normalize = (batch) => ({
        id: batch.id || this.createId('batch'),
        description: batch.description || batch.product || batch.productName || 'Product',
        batchNo: batch.batchNo || batch.batch_no || '',
        expiryDate: (batch.expiryDate || batch.expiry_date || '').slice(0, 7),
        quantity: Number(batch.remainingQuantity ?? batch.quantity ?? 0) || 0,
        totalCtns: Number(batch.totalCtns ?? batch.total_ctns ?? batch.quantity ?? 0) || 0,
        unitCost: Number(batch.unitCost || batch.cost || batch.unit_cost || 0)
      });

      batches.forEach((raw) => {
        const entry = normalize(raw);
        const location = String(raw.location || '').toLowerCase();
        if (location.includes('windhoek')) {
          warehouses.windhoek.push(entry);
        } else if (location.includes('ondangwa')) {
          warehouses.ondangwa.push(entry);
        } else {
          country.push(entry);
        }
      });

      if (country.length || warehouses.windhoek.length || warehouses.ondangwa.length) {
        this.data.country = country;
        this.data.warehouses = warehouses;
        this.saveStockData();
        this.renderAll();
      }
    },

    normalizeBackendTransfers(list) {
      return list.map((transfer) => {
        const firstItem = Array.isArray(transfer.items) && transfer.items.length ? transfer.items[0] : null;
        return {
          id: transfer.id || transfer.requestNumber || this.createId('transfer'),
          from: transfer.fromWarehouse || transfer.from || transfer.source || 'country',
          to: transfer.toBranch || transfer.to || transfer.destination || 'branch',
          product: firstItem?.productName || firstItem?.product_id || 'Mixed Items',
          quantity: Number(firstItem?.quantity || transfer.quantity || 0),
          status: transfer.status || 'pending',
          date: transfer.createdAt || transfer.created_at || transfer.updatedAt || new Date().toISOString(),
          reason: transfer.dispatchNotes || transfer.notes || ''
        };
      });
    },

    normalizeBackendRequests(list) {
      return list.map((req) => {
        const firstItem = Array.isArray(req.items) && req.items.length ? req.items[0] : null;
        return {
          id: req.id || req.requestNumber || this.createId('request'),
          branch: (req.requestingBranch || '').toLowerCase(),
          product: firstItem?.productName || firstItem?.productId || req.product || 'Product',
          quantity: Number(firstItem?.quantity || req.quantity || 0),
          priority: req.priority || 'normal',
          status: req.status || 'pending',
          createdAt: req.createdAt || req.created_at || new Date().toISOString()
        };
      });
    },

    async persistBatchesToBackend(entries) {
      if (!Array.isArray(entries) || !entries.length) return;
      await apiRequest('/stock-batches', {
        method: 'POST',
        body: entries.map((entry) => ({
          description: entry.description,
          batchNo: entry.batchNo,
          expiryDate: entry.expiryDate,
          quantity: entry.quantity,
          totalCtns: entry.totalCtns,
          unitCost: entry.unitCost,
          location: 'country_stock'
        })),
        fallback: null
      });
    },

    async persistTransferToBackend(payload) {
      if (!payload) return;
      const items = payload.items
        ? payload.items
        : [
            {
              productName: payload.product,
              quantity: payload.quantity,
              unit: payload.unit || 'units'
            }
          ];
      const body = {
        fromWarehouse: payload.fromWarehouse || undefined,
        toBranch: payload.toBranch || undefined,
        status: payload.status || 'pending',
        dispatchNotes: payload.notes || payload.dispatchNotes || undefined,
        items
      };
      if (!body.toBranch && payload.toWarehouse) {
        body.toWarehouse = payload.toWarehouse;
      }
      if (body.fromWarehouse || payload.fromBranch || body.toBranch || body.toWarehouse) {
        await apiRequest('/stock/transfers', {
          method: 'POST',
          body,
          fallback: null
        });
      }
    },

    /* ----------------------------------------------------------------------- */
    /* Country import & QA                                                     */
    /* ----------------------------------------------------------------------- */
    collectImportRows(form) {
      if (!form) return [];
      const body = form.querySelector('tbody[data-stock-import-body="true"]') || form.querySelector('tbody');
      if (!body) return [];
      const rows = Array.from(body.querySelectorAll('tr'));
      return rows
        .map((row) => {
          const get = (selector) => row.querySelector(selector)?.value?.trim() || '';
          return {
            id: this.createId('country'),
            cartonNo: get('.stock-carton-no'),
            description: get('.stock-description'),
            batchNo: get('.stock-batch-no'),
            expiryDate: get('.stock-expiry-date'),
            quantity: Number(get('.stock-quantity')) || 0,
            totalCtns: Number(get('.stock-total-ctns')) || Number(get('.stock-quantity')) || 0,
            unitCost: Number(form.querySelector('[data-unit-cost]')?.value || 0)
          };
        })
        .filter((item) => item.description && item.batchNo && item.quantity > 0);
    },

    renderImportSummary(entries) {
      const panel = document.getElementById('importSummaryPanel');
      if (!panel) return;
      if (!entries.length) {
        panel.style.display = 'none';
        return;
      }
      const totalQty = entries.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      panel.style.display = 'block';
      const content = document.getElementById('importSummaryContent');
      if (content) {
        content.innerHTML = `
          <p><strong>${entries.length}</strong> line(s) captured • <strong>${totalQty}</strong> units.</p>
          <ul style="margin:0;padding-left:18px;color:#475569;">
            ${entries
              .map(
                (item) =>
                  `<li>${this.escapeHtml(item.description)} — ${item.quantity} units (Batch ${this.escapeHtml(
                    item.batchNo
                  )})</li>`
              )
              .join('')}
          </ul>
        `;
      }
    },

    addStockImportRow(trigger) {
      this.ensureInit();
      this.onReady(() => {
        const form = this.resolveForm(trigger);
        if (!form) return;
        const body = form.querySelector('tbody[data-stock-import-body="true"]') || form.querySelector('tbody');
        if (!body) return;
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><input type="text" class="stock-carton-no" placeholder="A1-98"></td>
          <td><input type="text" class="stock-description" placeholder="Product description" required></td>
          <td><input type="text" class="stock-batch-no" placeholder="DP24265" required></td>
          <td><input type="month" class="stock-expiry-date" placeholder="YYYY-MM" required></td>
          <td><input type="number" class="stock-quantity" placeholder="Qty" min="1" required></td>
          <td><input type="number" class="stock-total-ctns" placeholder="CTNS" min="1"></td>
          <td style="text-align:center;">
            <button type="button" class="btn btn-danger" onclick="removeStockImportRow(this)">Remove</button>
          </td>
        `;
        body.appendChild(row);
      });
    },

    removeStockImportRow(trigger) {
      this.onReady(() => {
        const row = trigger?.closest('tr');
        const body = row?.parentElement;
        if (!row || !body) return;
        row.remove();
        if (!body.querySelector('tr')) {
          this.addStockImportRow(body.closest('form'));
        }
      });
    },

    clearStockImportForm(trigger) {
      this.onReady(() => {
        const form = this.resolveForm(trigger);
        if (!form) return;
        form.reset();
        const body = form.querySelector('tbody[data-stock-import-body="true"]') || form.querySelector('tbody');
        if (body) {
          body.innerHTML = '';
          this.addStockImportRow(form);
        }
        this.renderImportSummary([]);
      });
    },

    normalizeHeader(header) {
      return header
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
    },

    parseImportCsv(content) {
      const lines = String(content || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      if (!lines.length) return { valid: false, rows: [] };

      const [header, ...dataRows] = lines;
      const headers = header.split(',').map((h) => this.normalizeHeader(h));
      const required = ['cartonsno', 'description', 'batchno', 'expirydate', 'quantity'];
      const hasRequired = required.every((key) => headers.includes(key));
      const hasTotal = headers.includes('totalctns');

      if (!hasRequired) return { valid: false, rows: [] };

      const rows = dataRows
        .map((line) => line.split(','))
        .filter((cells) => cells.some((value) => value && value.trim()))
        .map((cells) => ({
          cartonNo: cells[0] || '',
          description: cells[1] || '',
          batchNo: cells[2] || '',
          expiryDate: (cells[3] || '').slice(0, 7),
          quantity: cells[4] || '',
          totalCtns: (hasTotal ? cells[5] : cells[4]) || ''
        }));

      return { valid: true, rows };
    },

    populateImportRows(form, rows) {
      const body = form.querySelector('tbody[data-stock-import-body="true"]') || form.querySelector('tbody');
      if (!body) return;
      body.innerHTML = '';
      rows.forEach((item) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><input type="text" class="stock-carton-no" value="${item.cartonNo || ''}"></td>
          <td><input type="text" class="stock-description" value="${item.description || ''}" required></td>
          <td><input type="text" class="stock-batch-no" value="${item.batchNo || ''}" required></td>
          <td><input type="month" class="stock-expiry-date" value="${(item.expiryDate || '').slice(0, 7)}" required></td>
          <td><input type="number" class="stock-quantity" value="${item.quantity || ''}" min="1" required></td>
          <td><input type="number" class="stock-total-ctns" value="${item.totalCtns || ''}" min="1"></td>
          <td style="text-align:center;">
            <button type="button" class="btn btn-danger" onclick="removeStockImportRow(this)">Remove</button>
          </td>
        `;
        body.appendChild(row);
      });
    },

    importFromCSV(trigger) {
      this.ensureInit();
      this.onReady(() => {
        const form = this.resolveForm(trigger);
        if (!form) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,text/csv';
        input.style.display = 'none';
        input.addEventListener('change', (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const { valid, rows } = this.parseImportCsv(reader.result);
            if (!valid) {
              this.notify('CSV header not recognized. Please use the default template.', 'error');
              return;
            }
            if (!rows.length) {
              this.notify('CSV file is empty.', 'warning');
              return;
            }

            this.populateImportRows(form, rows);
            this.renderImportSummary(this.collectImportRows(form));
            this.notify(`Imported ${rows.length} row(s) from CSV.`, 'success');
          };
          reader.readAsText(file);
        });
        document.body.appendChild(input);
        input.click();
        setTimeout(() => input.remove(), 0);
      });
    },

    handleBulkStockImportSubmit(event) {
      event?.preventDefault();
      this.ensureInit();
      this.onReady(() => {
        const form = event?.target || this.resolveForm();
        if (!form) return;
        const entries = this.collectImportRows(form);
        if (!entries.length) {
          this.notify('Please capture at least one stock line.', 'warning');
          return;
        }
        const current = this.getCountryStock();
        const normalize = (value) => (value || '').trim().toLowerCase();
        entries.forEach((entry) => {
          const existing = current.find(
            (item) =>
              normalize(item.description) === normalize(entry.description) &&
              normalize(item.batchNo) === normalize(entry.batchNo)
          );
          if (existing) {
            existing.quantity = Number(existing.quantity || 0) + entry.quantity;
            existing.totalCtns = Number(existing.totalCtns || 0) + entry.totalCtns;
            existing.batchNo = entry.batchNo || existing.batchNo;
            existing.expiryDate = entry.expiryDate || existing.expiryDate;
            existing.unitCost = entry.unitCost || existing.unitCost;
          } else {
            current.push(entry);
          }
          this.recordMovement({
            type: 'import',
            product: entry.description,
            quantity: entry.quantity,
            location: 'country',
            details: `Batch ${entry.batchNo}`
          });
        });
        this.setCountryStock(current);
        this.renderImportSummary(entries);
        this.displayCountryStock();
        this.displayCountryStockInventory();
        this.renderCountryTotals();
        this.notify('Country stock updated.', 'success');
        this.persistBatchesToBackend(entries);
        form.reset();
        const body = form.querySelector('tbody[data-stock-import-body="true"]') || form.querySelector('tbody');
        if (body) {
          body.innerHTML = '';
          this.addStockImportRow(form);
        }
      });
    },

    handleQualitySubmit(event) {
      event?.preventDefault();
      this.ensureInit();
      this.onReady(() => {
        const form = event?.target;
        if (!form) return;
        const get = (id) => form.querySelector(`#${id}`)?.value || '';
        const entry = {
          id: this.createId('qc'),
          batch: get('qcBatch-countryImport') || get('qcBatch-ondangwa'),
          reference: get('qcAsn-countryImport') || get('qcAsn-ondangwa') || '',
          date:
            get('qcDate-countryImport') ||
            get('qcDate-ondangwa') ||
            new Date().toISOString().slice(0, 10),
          temperature: get('qcTemperature-countryImport') || get('qcTemperature-ondangwa') || 'ambient',
          visual: get('qcVisual-countryImport') || get('qcVisual-ondangwa') || 'Pass',
          docs: get('qcDocs-countryImport') || get('qcDocs-ondangwa') || 'Complete',
          disposition:
            get('qcDisposition-countryImport') || get('qcDisposition-ondangwa') || 'Released',
          notes: get('qcNotes-countryImport') || get('qcNotes-ondangwa') || ''
        };
        if (!entry.batch) {
          this.notify('Batch number is required for QA.', 'warning');
          return;
        }
        const log = this.getQualityLog();
        log.unshift(entry);
        this.setQualityLog(log.slice(0, 50));
        this.renderQualityList();
        this.notify('Quality inspection recorded.', 'success');
        form.reset();
      });
    },

    renderQualityList() {
      this.onReady(() => {
        const targets = document.querySelectorAll('#qualityList');
        if (!targets.length) return;
        const log = this.getQualityLog();
        const html = log.length
          ? log
              .map(
                (item) => `
            <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;">
                <strong>Batch ${this.escapeHtml(item.batch)}</strong>
                <span style="font-size:0.85rem;color:#64748b;">${item.date || ''}</span>
              </div>
              <p style="margin:6px 0;color:#475569;">Disposition: <strong>${this.escapeHtml(
                item.disposition
              )}</strong></p>
              <p style="margin:0;color:#94a3b8;">${this.escapeHtml(item.notes || 'No notes')}</p>
            </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">No quality checks recorded yet.</p>';
        targets.forEach((node) => {
          node.innerHTML = html;
        });
      });
    },

    renderASNList() {
      this.onReady(() => {
        const container = document.getElementById('asnList');
        if (!container) return;
        const queue = this.readStorage(STORAGE_KEYS.asnQueue, DEFAULTS.asnQueue);
        if (!Array.isArray(queue) || !queue.length) {
          container.innerHTML =
            '<p style="text-align:center;color:#7f8c8d;">All supplier ASN have been cleared.</p>';
          return;
        }
        const html = queue
          .map(
            (asn) => `
            <div class="hub-card hub-card--tight">
              <div class="hub-card__row">
                <strong>${this.escapeHtml(asn.id)}</strong>
                <span style="font-size:0.85rem;color:#94a3b8;">${this.escapeHtml(asn.status || '')}</span>
              </div>
              <p style="margin:4px 0;color:#475569;">${this.escapeHtml(asn.supplier || 'Supplier TBC')}</p>
              <div style="display:flex;justify-content:space-between;font-size:0.85rem;color:#475569;">
                <span>${asn.cartons || 0} cartons • ${asn.pallets || 0} pallets</span>
                <span>ETA ${this.escapeHtml(asn.eta || 'TBC')}</span>
              </div>
            </div>`
          )
          .join('');
        container.innerHTML = html;
      });
    },

    renderPutawayQueue() {
      this.onReady(() => {
        const container =
          document.getElementById('putawayQueue') || document.querySelector('[data-putaway-queue]');
        if (!container) return;
        const queue = this.readStorage(STORAGE_KEYS.putawayQueue, DEFAULTS.putawayQueue);
        container.innerHTML = queue.length
          ? queue
              .map(
                (task) => `
            <div class="hub-card hub-card--tight">
              <div class="hub-card__row">
                <strong>${this.escapeHtml(task.id)}</strong>
                <span class="badge badge--${(task.priority || 'normal').toLowerCase()}">${this.escapeHtml(
                  task.priority || 'Normal'
                )}</span>
              </div>
              <p style="margin:4px 0;color:#475569;">${this.escapeHtml(task.warehouse || 'Warehouse')}</p>
              <div style="display:flex;justify-content:space-between;font-size:0.85rem;color:#475569;">
                <span>Zone ${this.escapeHtml(task.zone || '-')}</span>
                <span>${task.pallets || 0} pallets</span>
              </div>
            </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">No put-away tasks pending.</p>';
      });
    },

    renderWarehouseCapacity() {
      this.onReady(() => {
        const container =
          document.getElementById('warehouseCapacity') ||
          document.querySelector('[data-warehouse-capacity]');
        if (!container) return;
        const fallback = [
          { id: 'windhoek', name: 'Windhoek', max: 800 },
          { id: 'ondangwa', name: 'Ondangwa', max: 420 }
        ];
        const overrides = this.readStorage(STORAGE_KEYS.warehouseCapacity, fallback);
        const stock = this.getWarehouseStock();
        const cards = overrides.map((warehouse) => {
          const batches = stock[warehouse.id] || [];
          const used = batches.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
          const max = warehouse.max || 100;
          const pct = Math.min(100, Math.round((used / max) * 100));
          return `
            <div class="hub-card hub-card--tight">
              <div class="hub-card__row">
                <strong>${this.escapeHtml(warehouse.name || warehouse.id)}</strong>
                <span>${used}/${max} units</span>
              </div>
              <div class="progress">
                <div class="progress__bar" style="width:${pct}%;"></div>
              </div>
              <p style="margin:4px 0;color:#475569;">${pct}% utilized</p>
            </div>`;
        });
        container.innerHTML = cards.join('');
      });
    },

    renderReplenishmentSuggestions() {
      this.onReady(() => {
        const container =
          document.getElementById('replenishmentSuggestions') ||
          document.querySelector('[data-replenishment-list]');
        if (!container) return;
        const suggestions = this.readStorage(STORAGE_KEYS.replenishment, DEFAULTS.reorderPlans);
        const html = suggestions.length
          ? suggestions
              .map(
                (item) => `
            <div class="hub-card hub-card--tight">
              <strong>${this.escapeHtml(item.product)}</strong>
              <p style="margin:4px 0;color:#475569;">${this.escapeHtml(item.scenario || 'Scenario')}</p>
              <div style="display:flex;justify-content:space-between;font-size:0.85rem;color:#475569;">
                <span>${this.escapeHtml(item.recommendation || '')}</span>
                <span>${this.escapeHtml(item.impact || '')}</span>
              </div>
            </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">No replenishment actions required.</p>';
        container.innerHTML = html;
      });
    },

    renderBranchRequestList() {
      this.renderBranchRequests();
    },

    updateBranchMetrics() {
      this.onReady(() => {
        const requests = this.getBranchRequests();
        const total = requests.length;
        const pending = requests.filter((req) => (req.status || 'pending') === 'pending').length;
        const completed = total - pending;
        const totalUnits = requests.reduce((sum, req) => sum + (Number(req.quantity) || 0), 0);
        const write = (id, value) => {
          const node =
            document.getElementById(id) ||
            document.querySelector(`[data-branch-metric="${id}"]`);
          if (node) node.textContent = value;
        };
        write('branchMetricTotal', total);
        write('branchMetricPending', pending);
        write('branchMetricCompleted', completed);
        write('branchMetricUnits', totalUnits);
      });
    },

    renderReturnsList() {
      this.onReady(() => {
        const container = document.getElementById('returnsList');
        if (!container) return;
        const returns = this.readStorage(STORAGE_KEYS.returnsQueue, DEFAULTS.returnsQueue);
        container.innerHTML = returns.length
          ? returns
              .map(
                (item) => `
            <div class="hub-card hub-card--tight">
              <div class="hub-card__row">
                <strong>${this.escapeHtml(item.branch || 'Branch')}</strong>
                <span class="badge">${this.escapeHtml(item.status || 'Pending')}</span>
              </div>
              <p style="margin:4px 0;color:#475569;">${this.escapeHtml(item.product || '')}</p>
              <div style="display:flex;justify-content:space-between;font-size:0.85rem;color:#475569;">
                <span>${item.quantity || 0} units</span>
                <span>${this.escapeHtml(item.reason || '')}</span>
              </div>
            </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">No branch returns awaiting action.</p>';
      });
    },

    renderRouteBoard() {
      this.onReady(() => {
        const container =
          document.getElementById('routeBoard') || document.querySelector('[data-route-board]');
        if (!container) return;
        const routes = this.readStorage(STORAGE_KEYS.routeBoard, DEFAULTS.routeBoard);
        container.innerHTML = routes.length
          ? routes
              .map(
                (route) => `
            <div class="hub-card hub-card--tight">
              <div class="hub-card__row">
                <strong>${this.escapeHtml(route.origin || '')} ➜ ${this.escapeHtml(route.destination || '')}</strong>
                <span>${this.escapeHtml(route.status || '')}</span>
              </div>
              <p style="margin:4px 0;color:#475569;">${this.escapeHtml(route.vehicle || '')} • ${
                  route.driver || 'Driver TBC'
                }</p>
              <div style="font-size:0.85rem;color:#475569;">ETA ${this.escapeHtml(route.eta || '')}</div>
            </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">No live delivery routes captured.</p>';
      });
    },

    renderInventoryAlerts() {
      this.onReady(() => {
        const container =
          document.getElementById('inventoryAlerts') ||
          document.querySelector('[data-inventory-alerts]');
        if (!container) return;
        const alerts = this.readStorage(STORAGE_KEYS.inventoryAlerts, DEFAULTS.inventoryAlerts);
        container.innerHTML = alerts.length
          ? alerts
              .map(
                (alert) => `
            <div class="hub-card hub-card--tight">
              <div class="hub-card__row">
                <strong>${this.escapeHtml((alert.severity || 'info').toUpperCase())}</strong>
                <span>${this.escapeHtml(alert.action || '')}</span>
              </div>
              <p style="margin:0;color:#475569;">${this.escapeHtml(alert.message || '')}</p>
            </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">Inventory levels steady.</p>';
      });
    },

    renderReorderScenarioResults() {
      this.onReady(() => {
        const container = document.getElementById('reorderScenarioResults');
        if (!container) return;
        const plans = this.readStorage(STORAGE_KEYS.reorderPlans, DEFAULTS.reorderPlans);
        container.innerHTML = plans.length
          ? plans
              .map(
                (plan) => `
            <div class="hub-card hub-card--tight">
              <strong>${this.escapeHtml(plan.product)}</strong>
              <p style="margin:4px 0;color:#475569;">${this.escapeHtml(plan.scenario || '')}</p>
              <div style="display:flex;justify-content:space-between;font-size:0.85rem;color:#475569;">
                <span>${this.escapeHtml(plan.recommendation || '')}</span>
                <span>${this.escapeHtml(plan.impact || '')}</span>
              </div>
            </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">No simulation results yet.</p>';
      });
    },

    /* ----------------------------------------------------------------------- */
    /* Country & warehouse displays                                            */
    /* ----------------------------------------------------------------------- */
    displayCountryStock() {
      this.onReady(() => {
        const containers = document.querySelectorAll('#countryStockList');
        if (!containers.length) return;
        const term = (this.state.countrySearch || '').toLowerCase();
        const items = this.getCountryStock()
          .filter((item) => {
            if (!term) return true;
            const target = `${item.description || ''} ${item.batchNo || ''}`.toLowerCase();
            return target.includes(term);
          })
          .sort((a, b) => (a.description || '').localeCompare(b.description || ''));
        const html = items.length
          ? items
              .map(
                (item) => `
          <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <strong>${this.escapeHtml(item.description)}</strong>
                <div style="color:#94a3b8;font-size:0.85rem;">Batch ${this.escapeHtml(
                  item.batchNo || 'N/A'
                )} • Exp ${this.escapeHtml(item.expiryDate || 'TBC')}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-weight:700;">${item.quantity || 0} units</div>
                <div style="color:#94a3b8;font-size:0.85rem;">${this.formatCurrency(
                  (item.quantity || 0) * (item.unitCost || 0)
                )}</div>
              </div>
            </div>
          </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">No stock captured yet.</p>';
        containers.forEach((node) => {
          node.innerHTML = html;
        });
      });
    },

    searchCountryStock() {
      this.onReady(() => {
        const primary = document.getElementById('countryStockSearch-countryImport-1')?.value || '';
        const legacy = document.getElementById('countryStockSearch-countryImport-2')?.value || '';
        this.state.countrySearch = primary || legacy || '';
        this.displayCountryStock();
      });
    },

    displayWindhoekStock() {
      this.onReady(() => {
        const list = document.getElementById('windhoekStockList');
        if (!list) return;
        const stock = this.getWarehouseStock().windhoek || [];
        const term = (this.state.windhoekSearch || '').toLowerCase();
        const filtered = stock.filter((item) => {
          const matchesTerm = !term || (item.description || '').toLowerCase().includes(term);
          const lowStockMatch = !this.state.windhoekLowStockOnly || Number(item.quantity || 0) <= 20;
          return matchesTerm && lowStockMatch;
        });
        list.innerHTML = filtered.length
          ? filtered
              .map(
                (item) => `
          <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px;">
            <strong>${this.escapeHtml(item.description)}</strong>
            <div style="display:flex;justify-content:space-between;margin-top:6px;color:#475569;">
              <span>Qty: <strong>${item.quantity || 0}</strong></span>
              <span>Batch ${this.escapeHtml(item.batchNo || 'N/A')}</span>
            </div>
          </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">No products match the current filters.</p>';
      });
    },

    displayOndangwaStock() {
      this.onReady(() => {
        const list = document.getElementById('ondangwaStockList');
        if (!list) return;
        const stock = this.getWarehouseStock().ondangwa || [];
        list.innerHTML = stock.length
          ? stock
              .map(
                (item) => `
          <div style="background:white;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:8px;">
            <strong>${this.escapeHtml(item.description)}</strong>
            <div style="display:flex;justify-content:space-between;margin-top:6px;color:#475569;">
              <span>Qty: <strong>${item.quantity || 0}</strong></span>
              <span>Batch ${this.escapeHtml(item.batchNo || 'N/A')}</span>
            </div>
          </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">Ondangwa warehouse has no captured stock.</p>';
      });
    },

    searchWindhoekStock() {
      this.onReady(() => {
        const input = document.getElementById('windhoekSearch');
        this.state.windhoekSearch = input?.value || '';
        this.displayWindhoekStock();
      });
    },

    showLowStockWindhoek() {
      this.state.windhoekLowStockOnly = !this.state.windhoekLowStockOnly;
      this.displayWindhoekStock();
      this.notify(
        this.state.windhoekLowStockOnly
          ? 'Showing Windhoek products below 20 units.'
          : 'Showing all Windhoek inventory.',
        'info'
      );
    },

    displayCountryStockInventory() {
      this.onReady(() => {
        const container = document.getElementById('countryInventoryTable');
        if (!container) return;
        const location = document.getElementById('countryInvLocationFilter')?.value || 'all';
        const productFilter = document.getElementById('countryInvProductFilter')?.value || 'all';
        const rows = this.buildInventoryRows();
        this.updateCountryInventoryFilters(rows);
        const filtered = rows.filter((row) => {
          const matchesLocation =
            location === 'all' ||
            row.location === location ||
            (location === 'branches' && row.locationType === 'branch');
          const matchesProduct = productFilter === 'all' || row.product === productFilter;
          return matchesLocation && matchesProduct;
        });
        if (!filtered.length) {
          container.innerHTML = '<p style="text-align:center;color:#7f8c8d;">No inventory found.</p>';
          return;
        }
        const html = `
          <table class="table" style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8fafc;text-transform:uppercase;font-size:0.75rem;">
                <th style="text-align:left;padding:8px;">Location</th>
                <th style="text-align:left;padding:8px;">Product</th>
                <th style="text-align:right;padding:8px;">Quantity</th>
                <th style="text-align:right;padding:8px;">Value</th>
              </tr>
            </thead>
            <tbody>
              ${filtered
                .map(
                  (row) => `
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:8px;">${this.escapeHtml(row.locationLabel)}</td>
                  <td style="padding:8px;">${this.escapeHtml(row.product)}</td>
                  <td style="padding:8px;text-align:right;">${row.quantity}</td>
                  <td style="padding:8px;text-align:right;">${this.formatCurrency(row.value)}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        `;
        container.innerHTML = html;
      });
    },

    updateCountryInventoryFilters(rows) {
      const select = document.getElementById('countryInvProductFilter');
      if (!select) return;
      const selected = select.value;
      const options = Array.from(new Set(rows.map((row) => row.product))).sort();
      select.innerHTML = '<option value="all">All Products</option>';
      options.forEach((product) => {
        const option = document.createElement('option');
        option.value = product;
        option.textContent = product;
        select.appendChild(option);
      });
      if (selected && options.includes(selected)) {
        select.value = selected;
      }
    },

    buildInventoryRows() {
      const rows = [];
      this.getCountryStock().forEach((item) => {
        const qty = Number(item.quantity || 0);
        rows.push({
          location: 'country',
          locationLabel: 'Country Stock',
          locationType: 'country',
          product: item.description || 'Product',
          quantity: qty,
          value: qty * (item.unitCost || 0)
        });
      });
      const warehouses = this.getWarehouseStock();
      Object.entries(warehouses).forEach(([key, list]) => {
        list.forEach((item) => {
          const qty = Number(item.quantity || 0);
          rows.push({
            location: key,
            locationLabel: key === 'windhoek' ? 'Windhoek Warehouse' : 'Ondangwa Warehouse',
            locationType: 'warehouse',
            product: item.description || 'Product',
            quantity: qty,
            value: qty * (item.unitCost || 0)
          });
        });
      });
      const branches = this.getBranchStock();
      Object.entries(branches).forEach(([code, items]) => {
        const readable =
          DEFAULT_BRANCH_LIST.find((branch) => branch.id === code)?.name ||
          code.replace(/^\w/, (c) => c.toUpperCase());
        (Array.isArray(items) ? items : Object.entries(items).map(([product, quantity]) => ({ product, quantity }))).forEach(
          (item) => {
            const qty = Number(item.quantity || item.quantity === 0 ? item.quantity : item[1] || 0);
            const name = item.description || item.product || item[0] || 'Product';
            rows.push({
              location: 'branches',
              locationLabel: readable,
              locationType: 'branch',
              product: name,
              quantity: qty,
              value: qty * 0
            });
          }
        );
      });
      return rows;
    },

    renderCountryTotals() {
      this.onReady(() => {
        const rows = this.buildInventoryRows();
        const countryTotal = rows
          .filter((row) => row.location === 'country')
          .reduce((sum, row) => sum + row.value, 0);
        const warehouseTotal = rows
          .filter((row) => row.locationType === 'warehouse')
          .reduce((sum, row) => sum + row.value, 0);
        const branchTotal = rows
          .filter((row) => row.locationType === 'branch')
          .reduce((sum, row) => sum + row.value, 0);
        const productCount = new Set(rows.map((row) => row.product)).size;
        const setText = (id, value) => {
          const el = document.getElementById(id);
          if (el) el.textContent = value;
        };
        setText('countryTotalValue', this.formatCurrency(countryTotal));
        setText('warehouseTotalValue', this.formatCurrency(warehouseTotal));
        setText('branchTotalValue', this.formatCurrency(branchTotal));
        setText('countryTotalProducts', String(productCount));
      });
    },

    renderWarehouseSummaries() {
      this.onReady(() => {
        const windhoekSummary = document.getElementById('windhoekInventorySummary');
        const ondangwaSummary = document.getElementById('ondangwaInventorySummary');
        const warehouses = this.getWarehouseStock();
        if (windhoekSummary) {
          const list = warehouses.windhoek || [];
          const qty = list.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
          windhoekSummary.innerHTML = `
            <p style="margin:0;color:#1f2937;">${list.length} SKUs</p>
            <p style="margin:4px 0 0;color:#94a3b8;">${qty} units available</p>
          `;
        }
        if (ondangwaSummary) {
          const list = warehouses.ondangwa || [];
          const qty = list.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
          ondangwaSummary.innerHTML = `
            <p style="margin:0;color:#1f2937;">${list.length} SKUs</p>
            <p style="margin:4px 0 0;color:#94a3b8;">${qty} units available</p>
          `;
        }
      });
    },

    /* ----------------------------------------------------------------------- */
    /* Inventory movements & reporting                                        */
    /* ----------------------------------------------------------------------- */
    recordMovement(entry) {
      const movements = this.getInventoryMovements();
      movements.unshift({
        id: entry.id || this.createId('mv'),
        type: entry.type || 'movement',
        product: entry.product || 'Product',
        quantity: Number(entry.quantity || 0),
        location: entry.location || 'country',
        date: entry.date || new Date().toISOString(),
        details: entry.details || ''
      });
      this.setInventoryMovements(movements);
      this.displayInventoryMovements();
    },

    filterInventoryMovements() {
      this.onReady(() => {
        const location = document.getElementById('inventoryLocationFilter')?.value || 'all';
        const movement = document.getElementById('inventoryMovementFilter')?.value || 'all';
        const product = document.getElementById('inventoryProductSearch')?.value || '';
        const from = document.getElementById('inventoryDateFrom')?.value || '';
        const to = document.getElementById('inventoryDateTo')?.value || '';
        this.state.inventoryFilters = { location, movement, product, from, to };
        this.displayInventoryMovements();
      });
    },

    displayInventoryMovements() {
      this.onReady(() => {
        const list = document.getElementById('inventoryMovementsList');
        if (!list) return;
        const filters = this.state.inventoryFilters || {
          location: 'all',
          movement: 'all',
          product: '',
          from: '',
          to: ''
        };
        const data = this.getInventoryMovements().filter((item) => {
          const matchesLocation =
            filters.location === 'all' || (item.location || '').toLowerCase().includes(filters.location);
          const matchesMovement = filters.movement === 'all' || item.type === filters.movement;
          const matchesProduct =
            !filters.product || (item.product || '').toLowerCase().includes(filters.product.toLowerCase());
          const date = new Date(item.date || Date.now());
          const fromDate = filters.from ? new Date(filters.from) : null;
          const toDate = filters.to ? new Date(filters.to) : null;
          const matchesFrom = !fromDate || date >= fromDate;
          const matchesTo = !toDate || date <= toDate;
          return matchesLocation && matchesMovement && matchesProduct && matchesFrom && matchesTo;
        });
        list.innerHTML = data.length
          ? data
              .map(
                (item) => `
            <div style="border-bottom:1px solid #e2e8f0;padding:8px 4px;">
              <div style="display:flex;justify-content:space-between;">
                <strong>${this.escapeHtml(item.product)}</strong>
                <span style="font-size:0.8rem;color:#94a3b8;">${new Date(item.date).toLocaleString()}</span>
              </div>
              <div style="color:#475569;font-size:0.9rem;">
                ${item.type.toUpperCase()} • ${item.quantity} units • ${this.escapeHtml(item.location)}
              </div>
              ${
                item.details
                  ? `<div style="color:#94a3b8;font-size:0.85rem;">${this.escapeHtml(item.details)}</div>`
                  : ''
              }
            </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">No movements match the current filters.</p>';
      });
    },

    exportInventoryMovements() {
      this.onReady(() => {
        const list = this.getInventoryMovements();
        if (!list.length) {
          this.notify('No movements available to export.', 'warning');
          return;
        }
        const rows = [['Date', 'Type', 'Product', 'Quantity', 'Location', 'Details']];
        list.forEach((item) => {
          rows.push([
            item.date,
            item.type,
            item.product,
            item.quantity,
            item.location,
            item.details || ''
          ]);
        });
        const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'inventory-movements.csv';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          link.remove();
        }, 0);
      });
    },

    renderInventoryTimelyReport(range) {
      this.onReady(() => {
        const now = new Date();
        const rangeMap = {
          daily: 1,
          weekly: 7,
          monthly: 30,
          quarterly: 90,
          yearly: 365
        };
        const days = rangeMap[range] || 30;
        const fromDate = new Date(now.getTime() - days * 86400000);
        const movements = this.getInventoryMovements().filter((entry) => new Date(entry.date || 0) >= fromDate);
        const invoices = this.getInvoices().filter((invoice) => new Date(invoice.date || 0) >= fromDate);

        const received = movements
          .filter((m) => m.type === 'import')
          .reduce((sum, m) => sum + Number(m.quantity || 0), 0);
        const distributions = movements
          .filter((m) => m.type === 'distribution')
          .reduce((sum, m) => sum + Number(m.quantity || 0), 0);
        const onlineSales = invoices.filter((invoice) => invoice.channel === 'online').reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
        const walkInSales = invoices.filter((invoice) => invoice.channel === 'walk-in').reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
        const consultantSales = invoices.filter((invoice) => invoice.channel === 'consultant').reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
        const refunds = invoices.reduce((sum, invoice) => sum + Number(invoice.refunded || 0), 0);

        const setValue = (id, value) => {
          const el = document.getElementById(id);
          if (el) el.textContent = value;
        };

        setValue('inventoryReportReceived', received);
        setValue('inventoryReportSold', distributions);
        setValue('inventoryReportFieldSales', consultantSales.toFixed(0));
        setValue('inventoryReportConsultantSales', consultantSales.toFixed(0));
        setValue('inventoryReportOnlineSales', onlineSales.toFixed(0));
        setValue('inventoryReportWalkinSales', walkInSales.toFixed(0));
        setValue('inventoryReportCashRefunds', refunds.toFixed(0));

        const metaText = `Last ${days} day(s)`;
        [
          'inventoryReportReceivedMeta',
          'inventoryReportSoldMeta',
          'inventoryReportFieldSalesMeta',
          'inventoryReportConsultantSalesMeta',
          'inventoryReportOnlineSalesMeta',
          'inventoryReportWalkinSalesMeta',
          'inventoryReportCashRefundsMeta'
        ].forEach((id) => {
          const node = document.getElementById(id);
          if (node) node.textContent = metaText;
        });
      });
    },

    /* ----------------------------------------------------------------------- */
    /* Warehouse & branch operations                                          */
    /* ----------------------------------------------------------------------- */
    getBranchList() {
      const stored = this.readStorage('dyna_branches', DEFAULT_BRANCH_LIST);
      if (Array.isArray(stored) && stored.length) {
        return stored
          .map((entry) => {
            if (typeof entry === 'string') {
              return { id: entry.toLowerCase(), name: entry };
            }
            return {
              id: (entry.id || entry.code || entry.branch || entry.name || '').toLowerCase() || this.createId('branch'),
              name: entry.name || entry.branch || entry.description || entry.id || 'Branch'
            };
          })
          .filter((entry) => entry.id && entry.name);
      }
      return DEFAULT_BRANCH_LIST;
    },

    loadBranchesForDistribution() {
      this.onReady(() => {
        const select = document.getElementById('branchDistDestination');
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">Select Branch</option>';
        this.getBranchList().forEach((branch) => {
          const option = document.createElement('option');
          option.value = branch.id;
          option.textContent = branch.name;
          select.appendChild(option);
        });
        if (current) select.value = current;
      });
    },

    populateTransferBranchOptions() {
      this.onReady(() => {
        const select = document.getElementById('transferBranch');
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">Select Branch</option>';
        this.getBranchList().forEach((branch) => {
          const option = document.createElement('option');
          option.value = branch.id;
          option.textContent = branch.name;
          select.appendChild(option);
        });
        if (current) select.value = current;
      });
    },

    productOptionsFromCountry() {
      return Array.from(new Set(this.getCountryStock().map((item) => item.description || 'Product')));
    },

    populateProductSelect(select, options) {
      if (!select) return;
      const current = select.value;
      select.innerHTML = '<option value="">Select Product</option>';
      options.forEach((product) => {
        const option = document.createElement('option');
        option.value = product;
        option.textContent = product;
        select.appendChild(option);
      });
      if (current && options.includes(current)) {
        select.value = current;
      }
    },

    loadWindhoekProducts() {
      this.onReady(() => {
        const options = this.productOptionsFromCountry();
        this.populateProductSelect(document.getElementById('windhoekProduct'), options);
        this.populateProductSelect(document.getElementById('windhoekProduct-distribution'), options);
      });
    },

    loadOndangwaProducts() {
      this.onReady(() => {
        const options = this.productOptionsFromCountry();
        this.populateProductSelect(document.getElementById('ondangwaProduct'), options);
        this.populateProductSelect(document.getElementById('ondangwaProductNew'), options);
      });
    },

    populateBranchDistributionProducts() {
      this.onReady(() => {
        const source = document.getElementById('branchDistSourceWarehouse')?.value || 'windhoek';
        const warehouses = this.getWarehouseStock();
        const list = (warehouses[source] || []).map((item) => item.description || 'Product');
        this.populateProductSelect(document.getElementById('branchDistProduct'), Array.from(new Set(list)));
      });
    },

    loadTransferFromProducts() {
      this.onReady(() => {
        const source = document.getElementById('transferFromLocation')?.value || 'country';
        let options = [];
        if (source === 'country') {
          options = this.productOptionsFromCountry();
        } else if (source === 'windhoek' || source === 'ondangwa') {
          options = (this.getWarehouseStock()[source] || []).map((item) => item.description || 'Product');
        } else {
          const branchStock = this.getBranchStock()[source] || [];
          options = Array.isArray(branchStock)
            ? branchStock.map((item) => item.description || item.product || 'Product')
            : Object.keys(branchStock);
        }
        this.populateProductSelect(document.getElementById('transferProduct'), Array.from(new Set(options)));
      });
    },

    updateWindhoekAvailableQuantity() {
      this.onReady(() => {
        const select = document.getElementById('windhoekProduct') || document.getElementById('windhoekProduct-distribution');
        if (!select) return;
        const product = select.value;
        const qty = this.getCountryStock()
          .filter((item) => (item.description || '').toLowerCase() === product.toLowerCase())
          .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const targets = ['windhoekAvailableQty-legacy', 'windhoekAvailableQty-distribution'];
        targets.forEach((id) => {
          const input = document.getElementById(id);
          if (input) input.value = qty ? `${qty} units` : '0';
        });
      });
    },

    updateOndangwaAvailableQuantity() {
      this.onReady(() => {
        const select = document.getElementById('ondangwaProduct') || document.getElementById('ondangwaProductNew');
        if (!select) return;
        const product = select.value;
        const qty = this.getCountryStock()
          .filter((item) => (item.description || '').toLowerCase() === product.toLowerCase())
          .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const targets = ['ondangwaAvailableQtyNew'];
        targets.forEach((id) => {
          const input = document.getElementById(id);
          if (input) input.value = qty ? `${qty} units` : '0';
        });
      });
    },

    updateBranchDistAvailableQty() {
      this.onReady(() => {
        const warehouse = document.getElementById('branchDistSourceWarehouse')?.value || 'windhoek';
        const product = document.getElementById('branchDistProduct')?.value || '';
        const qty = (this.getWarehouseStock()[warehouse] || [])
          .filter((item) => (item.description || '').toLowerCase() === product.toLowerCase())
          .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const input = document.getElementById('branchDistAvailableQty');
        if (input) input.value = qty ? `${qty} units` : '0';
      });
    },

    adjustCountryStock(productName, delta, meta = {}) {
      const list = this.getCountryStock();
      const targetName = (productName || '').toLowerCase();
      let remaining = delta;
      if (!targetName) return { ok: false, message: 'Product is required.' };
      if (delta < 0) {
        const available = list
          .filter((item) => (item.description || '').toLowerCase() === targetName)
          .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        if (available < Math.abs(delta)) {
          return { ok: false, message: 'Insufficient country stock.' };
        }
        const matching = list.filter(
          (item) => (item.description || '').toLowerCase() === targetName && Number(item.quantity || 0) > 0
        );
        let needed = Math.abs(delta);
        for (const item of matching) {
          if (needed <= 0) break;
          const currentQty = Number(item.quantity || 0);
          const take = Math.min(currentQty, needed);
          item.quantity = currentQty - take;
          item.totalCtns = Math.max(0, Number(item.totalCtns || 0) - take);
          needed -= take;
        }
      } else if (delta > 0) {
        const existing = list.find((item) => (item.description || '').toLowerCase() === targetName);
        if (existing) {
          existing.quantity = Number(existing.quantity || 0) + delta;
          existing.totalCtns = Number(existing.totalCtns || 0) + delta;
        } else {
          list.push({
            id: this.createId('country'),
            description: productName,
            batchNo: meta.batchNo || `AUTO-${new Date().getFullYear()}`,
            expiryDate: meta.expiryDate || '',
            quantity: delta,
            totalCtns: delta,
            unitCost: meta.unitCost || 0
          });
        }
      }
      this.setCountryStock(list.filter((item) => Number(item.quantity || 0) > 0));
      return { ok: true };
    },

    adjustWarehouseStock(warehouse, productName, delta, meta = {}) {
      const stock = this.getWarehouseStock();
      const list = stock[warehouse] || [];
      const targetName = (productName || '').toLowerCase();
      if (!targetName) return { ok: false, message: 'Product is required.' };
      if (delta < 0) {
        const available = list
          .filter((item) => (item.description || '').toLowerCase() === targetName)
          .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        if (available < Math.abs(delta)) {
          return { ok: false, message: `Insufficient stock in ${warehouse}.` };
        }
        let needed = Math.abs(delta);
        for (const item of list) {
          if ((item.description || '').toLowerCase() !== targetName) continue;
          if (needed <= 0) break;
          const currentQty = Number(item.quantity || 0);
          const take = Math.min(currentQty, needed);
          item.quantity = currentQty - take;
          needed -= take;
        }
      } else if (delta > 0) {
        const existing = list.find((item) => (item.description || '').toLowerCase() === targetName);
        if (existing) {
          existing.quantity = Number(existing.quantity || 0) + delta;
        } else {
          list.push({
            id: this.createId(`${warehouse}`),
            description: productName,
            batchNo: meta.batchNo || '',
            expiryDate: meta.expiryDate || '',
            quantity: delta,
            unitCost: meta.unitCost || 0
          });
        }
      }
      stock[warehouse] = list.filter((item) => Number(item.quantity || 0) > 0);
      this.setWarehouseStock(stock);
      return { ok: true };
    },

    adjustBranchStock(branchId, productName, delta) {
      const map = this.getBranchStock();
      const branchKey = branchId.toLowerCase();
      const entries = Array.isArray(map[branchKey])
        ? map[branchKey]
        : Object.entries(map[branchKey] || {}).map(([product, quantity]) => ({ description: product, quantity }));
      const targetName = (productName || '').toLowerCase();
      if (!entries.length && delta < 0) {
        return { ok: false, message: 'Branch has no stock yet.' };
      }
      const existing = entries.find((item) => (item.description || item.product || '').toLowerCase() === targetName);
      if (delta < 0) {
        if (!existing || Number(existing.quantity || 0) + delta < 0) {
          return { ok: false, message: 'Branch stock would become negative.' };
        }
        existing.quantity = Number(existing.quantity || 0) + delta;
      } else {
        if (existing) {
          existing.quantity = Number(existing.quantity || 0) + delta;
        } else {
          entries.push({ description: productName, quantity: delta });
        }
      }
      map[branchKey] = entries.filter((item) => Number(item.quantity || 0) > 0);
      this.setBranchStock(map);
      return { ok: true };
    },

    moveBetweenLocations(fromKey, toKey, product, qty, meta = {}) {
      const [fromType, fromId] = fromKey.split(':');
      const [toType, toId] = toKey.split(':');
      if (fromType === 'country') {
        const result = this.adjustCountryStock(product, -qty);
        if (!result.ok) return result;
      } else if (fromType === 'warehouse') {
        const result = this.adjustWarehouseStock(fromId, product, -qty);
        if (!result.ok) return result;
      } else if (fromType === 'branch') {
        const result = this.adjustBranchStock(fromId, product, -qty);
        if (!result.ok) return result;
      }

      if (toType === 'country') {
        const result = this.adjustCountryStock(product, qty, meta);
        if (!result.ok) return result;
      } else if (toType === 'warehouse') {
        const result = this.adjustWarehouseStock(toId, product, qty, meta);
        if (!result.ok) return result;
      } else if (toType === 'branch') {
        const result = this.adjustBranchStock(toId, product, qty);
        if (!result.ok) return result;
      }
      return { ok: true };
    },

    handleTransferToWindhoek(event) {
      event?.preventDefault();
      this.onReady(() => {
        const product =
          document.getElementById('windhoekProduct-distribution')?.value ||
          document.getElementById('windhoekProduct')?.value ||
          '';
        const qty =
          Number(document.getElementById('windhoekQuantity-distribution')?.value) ||
          Number(document.getElementById('windhoekQuantity-legacy')?.value) ||
          0;
        if (!product || qty <= 0) {
          this.notify('Select a product and quantity.', 'warning');
          return;
        }
        const result = this.moveBetweenLocations('country', 'warehouse:windhoek', product, qty);
        if (!result.ok) {
          this.notify(result.message || 'Transfer failed.', 'error');
          return;
        }
        this.recordMovement({
          type: 'transfer',
          product,
          quantity: qty,
          location: 'windhoek',
          details: 'Country ➜ Windhoek'
        });
        this.displayWindhoekStock();
        this.updateWindhoekAvailableQuantity();
        this.displayCountryStock();
        this.notify('Stock transferred to Windhoek.', 'success');
        event?.target?.reset();
      });
    },

    handleTransferToOndangwa(event) {
      event?.preventDefault();
      this.onReady(() => {
        const product = document.getElementById('ondangwaProductNew')?.value || document.getElementById('ondangwaProduct')?.value || '';
        const qty =
          Number(document.getElementById('ondangwaQuantityNew')?.value) ||
          Number(document.getElementById('ondangwaQuantity-legacy')?.value) ||
          0;
        if (!product || qty <= 0) {
          this.notify('Select a product and quantity.', 'warning');
          return;
        }
        const result = this.moveBetweenLocations('country', 'warehouse:ondangwa', product, qty);
        if (!result.ok) {
          this.notify(result.message || 'Transfer failed.', 'error');
          return;
        }
        this.recordMovement({
          type: 'transfer',
          product,
          quantity: qty,
          location: 'ondangwa',
          details: 'Country ➜ Ondangwa'
        });
        this.displayOndangwaStock();
        this.updateOndangwaAvailableQuantity();
        this.displayCountryStock();
        this.notify('Stock transferred to Ondangwa.', 'success');
        event?.target?.reset();
      });
    },

    handleBranchDistribution(event) {
      event?.preventDefault();
      this.onReady(() => {
        const warehouse = document.getElementById('branchDistSourceWarehouse')?.value || 'windhoek';
        const branch = document.getElementById('branchDistDestination')?.value || '';
        const product = document.getElementById('branchDistProduct')?.value || '';
        const qty = Number(document.getElementById('branchDistQuantity')?.value || 0);
        const priority = document.getElementById('branchDistPriority')?.value || 'normal';
        const notes = document.getElementById('branchDistNotes')?.value || '';
        if (!branch || !product || qty <= 0) {
          this.notify('Select source, branch, product, and quantity.', 'warning');
          return;
        }
        const result = this.moveBetweenLocations(`warehouse:${warehouse}`, `branch:${branch}`, product, qty);
        if (!result.ok) {
          this.notify(result.message || 'Distribution failed.', 'error');
          return;
        }
        this.recordDistribution({
          warehouse,
          branch,
          product,
          quantity: qty,
          notes
        });
        this.recordMovement({
          type: 'distribution',
          product,
          quantity: qty,
          location: `branch:${branch}`,
          details: `${warehouse} ➜ ${branch}`
        });
        this.resolveBranchRequest(branch, product);
        this.displayDistributionHistory();
        this.displayWindhoekStock();
        this.displayOndangwaStock();
        this.renderBranchRequests();
        this.notify('Branch distribution recorded.', 'success');
        this.persistTransferToBackend({
          fromWarehouse: warehouse,
          toBranch: branch,
          product,
          quantity: qty,
          status: 'pending',
          notes
        });
        event?.target?.reset();
      });
    },

    resolveBranchRequest(branch, product) {
      const requests = this.getBranchRequests();
      const target = requests.find(
        (req) =>
          req.status === 'pending' &&
          req.branch === branch &&
          (req.product || '').toLowerCase() === product.toLowerCase()
      );
      if (target) {
        target.status = 'completed';
        target.completedAt = new Date().toISOString();
        this.setBranchRequests(requests);
      }
    },

    recordDistribution(entry) {
      const history = this.getDistributionHistory();
      history.unshift({
        id: entry.id || this.createId('dist'),
        date: entry.date || new Date().toISOString(),
        warehouse:
          entry.warehouse === 'ondangwa'
            ? 'Ondangwa Warehouse'
            : entry.warehouse === 'windhoek'
            ? 'Windhoek Warehouse'
            : entry.warehouse || 'Warehouse',
        branch: this.getBranchList().find((b) => b.id === entry.branch)?.name || entry.branch || 'Branch',
        product: entry.product,
        quantity: entry.quantity,
        notes: entry.notes || ''
      });
      this.setDistributionHistory(history.slice(0, 200));
    },

    displayDistributionHistory() {
      this.onReady(() => {
        const list = document.getElementById('distributionHistoryList');
        const branchList = document.getElementById('branchDistributionHistory');
        const searchTerm = (this.state.distributionSearch || '').toLowerCase();
        const history = this.getDistributionHistory().filter((entry) => {
          const target = `${entry.product} ${entry.branch} ${entry.warehouse}`.toLowerCase();
          return !searchTerm || target.includes(searchTerm);
        });
        const html = history.length
          ? history
              .map(
                (entry) => `
            <div style="border-bottom:1px solid #e2e8f0;padding:8px 4px;">
              <div style="display:flex;justify-content:space-between;">
                <strong>${this.escapeHtml(entry.product)}</strong>
                <span style="font-size:0.8rem;color:#94a3b8;">${new Date(entry.date).toLocaleString()}</span>
              </div>
              <div style="color:#475569;font-size:0.9rem;">
                ${this.escapeHtml(entry.warehouse)} ➜ ${this.escapeHtml(entry.branch)} • ${entry.quantity} units
              </div>
              ${entry.notes ? `<div style="color:#94a3b8;font-size:0.85rem;">${this.escapeHtml(entry.notes)}</div>` : ''}
            </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">No distributions logged yet.</p>';
        if (list) list.innerHTML = html;
        if (branchList) branchList.innerHTML = html;
      });
    },

    searchDistribution() {
      this.onReady(() => {
        const input = document.getElementById('distributionSearch');
        this.state.distributionSearch = input?.value || '';
        this.displayDistributionHistory();
      });
    },

    handleStockTransfer(event) {
      event?.preventDefault();
      this.onReady(() => {
        const from = document.getElementById('transferFromLocation')?.value || 'country';
        let to = document.getElementById('transferToLocation')?.value || 'windhoek';
        const branch = document.getElementById('transferBranch')?.value || '';
        const product = document.getElementById('transferProduct')?.value || '';
        const qty = Number(document.getElementById('transferQuantity-ondangwa')?.value || 0);
        const reason = document.getElementById('transferReason-ondangwa')?.value || '';
        const notes = document.getElementById('transferNotes-ondangwa')?.value || '';
        if (!product || qty <= 0) {
          this.notify('Select product and quantity.', 'warning');
          return;
        }
        if (to === 'branch') {
          if (!branch) {
            this.notify('Select the destination branch.', 'warning');
            return;
          }
          to = `branch:${branch}`;
        } else {
          to = to === 'country' ? 'country' : `warehouse:${to}`;
        }
        const fromKey = from === 'country' ? 'country' : `warehouse:${from}`;
        const result = this.moveBetweenLocations(fromKey, to, product, qty, { notes });
        if (!result.ok) {
          this.notify(result.message || 'Transfer failed.', 'error');
          return;
        }
        const transfers = this.getTransfers();
        transfers.unshift({
          id: this.createId('transfer'),
          from: fromKey,
          to,
          product,
          quantity: qty,
          status: 'pending',
          reason,
          notes,
          date: new Date().toISOString()
        });
        this.setTransfers(transfers);
        this.recordMovement({
          type: 'transfer',
          product,
          quantity: qty,
          location: `${fromKey} ➜ ${to}`,
          details: reason || ''
        });
        this.loadStockTransfers();
        this.displayWindhoekStock();
        this.displayOndangwaStock();
        this.displayCountryStock();
        this.notify('Transfer captured.', 'success');
        this.persistTransferToBackend({
          fromWarehouse: fromKey.startsWith('warehouse:') ? fromKey.split(':')[1] : undefined,
          fromBranch: fromKey.startsWith('branch:') ? fromKey.split(':')[1] : undefined,
          toBranch: to.startsWith('branch:') ? to.split(':')[1] : undefined,
          toWarehouse: to.startsWith('warehouse:') ? to.split(':')[1] : undefined,
          product,
          quantity: qty,
          status: 'pending',
          notes
        });
        event?.target?.reset();
      });
    },

    loadStockTransfers() {
      this.onReady(() => {
        const list = document.getElementById('activeTransfersList');
        if (!list) return;
        const statusFilter = document.getElementById('transferStatusFilter')?.value || 'all';
        const transfers = this.getTransfers().filter(
          (transfer) => statusFilter === 'all' || transfer.status === statusFilter
        );
        list.innerHTML = transfers.length
          ? transfers
              .map(
                (transfer) => `
            <div style="border-bottom:1px solid #e2e8f0;padding:8px 0;">
              <div style="display:flex;justify-content:space-between;">
                <strong>${this.escapeHtml(transfer.product)}</strong>
                <span style="font-size:0.8rem;color:#94a3b8;">${new Date(transfer.date).toLocaleString()}</span>
              </div>
              <div style="color:#475569;font-size:0.9rem;">
                ${this.escapeHtml(transfer.from)} ➜ ${this.escapeHtml(transfer.to)} • ${transfer.quantity} units
              </div>
              ${transfer.reason ? `<div style="color:#94a3b8;font-size:0.85rem;">${this.escapeHtml(transfer.reason)}</div>` : ''}
            </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">No transfers recorded.</p>';
      });
    },

    renderBranchRequests() {
      this.onReady(() => {
        const container = document.getElementById('pendingBranchRequests');
        if (!container) return;
        const requests = this.getBranchRequests().filter((req) => req.status === 'pending');
        container.innerHTML = requests.length
          ? requests
              .map(
                (req) => `
            <div style="border-bottom:1px solid #e2e8f0;padding:10px 0;">
              <div style="display:flex;justify-content:space-between;">
                <strong>${this.escapeHtml(req.product)}</strong>
                <span style="font-size:0.8rem;color:#94a3b8;">${req.priority.toUpperCase()}</span>
              </div>
              <div style="color:#475569;">
                ${this.getBranchList().find((b) => b.id === req.branch)?.name || req.branch} • ${req.quantity} units
              </div>
            </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">No pending branch requests.</p>';
      });
    },

    /* ----------------------------------------------------------------------- */
    /* Distribution & sharing views                                           */
    /* ----------------------------------------------------------------------- */
    loadShopWarehouseSharing() {
      this.onReady(() => {
        const shopList = document.getElementById('shopVisibilityList');
        const warehouseList = document.getElementById('warehouseSharingList');
        const rules = this.getSharingRules();
        const shopRules = rules.filter((rule) => rule.to.startsWith('branch:'));
        const warehouseRules = rules.filter((rule) => rule.to.startsWith('warehouse:'));
        const render = (target, entries) => {
          if (!target) return;
          target.innerHTML = entries.length
            ? entries
                .map(
                  (rule) => `
              <div style="border-bottom:1px solid #e2e8f0;padding:8px 0;">
                <strong>${this.escapeHtml(rule.from)}</strong> ➜ ${this.escapeHtml(rule.to)}<br>
                <span style="color:#94a3b8;font-size:0.85rem;">${rule.accessLevel} • ${
                    rule.status
                  } • ${new Date(rule.createdAt).toLocaleDateString()}</span>
              </div>`
                )
                .join('')
            : '<p style="text-align:center;color:#7f8c8d;">No sharing rules defined yet.</p>';
        };
        render(shopList, shopRules);
        render(warehouseList, warehouseRules);
      });
    },

    populateSharingLocations() {
      this.onReady(() => {
        const fromSelect = document.getElementById('sharingFrom');
        const toSelect = document.getElementById('sharingTo');
        if (!fromSelect || !toSelect) return;
        const currentFrom = fromSelect.value;
        const currentTo = toSelect.value;
        const locations = [
          { id: 'warehouse:windhoek', label: 'Windhoek Warehouse' },
          { id: 'warehouse:ondangwa', label: 'Ondangwa Warehouse' },
          { id: 'country', label: 'Country Stock' },
          ...this.getBranchList().map((branch) => ({ id: `branch:${branch.id}`, label: branch.name }))
        ];
        const populate = (select, selected) => {
          select.innerHTML = '<option value="">Select Location</option>';
          locations.forEach((loc) => {
            const option = document.createElement('option');
            option.value = loc.id;
            option.textContent = loc.label;
            select.appendChild(option);
          });
          if (selected) select.value = selected;
        };
        populate(fromSelect, currentFrom);
        populate(toSelect, currentTo);
      });
    },

    handleSharingRule(event) {
      event?.preventDefault();
      this.onReady(() => {
        const from = document.getElementById('sharingFrom')?.value || '';
        const to = document.getElementById('sharingTo')?.value || '';
        const accessLevel = document.getElementById('sharingAccessLevel')?.value || 'view';
        const status = document.getElementById('sharingStatus')?.value || 'active';
        if (!from || !to) {
          this.notify('Select both source and destination locations.', 'warning');
          return;
        }
        if (from === to) {
          this.notify('From and To cannot be the same location.', 'warning');
          return;
        }
        const rules = this.getSharingRules();
        rules.unshift({
          id: this.createId('share'),
          from,
          to,
          accessLevel,
          status,
          createdAt: new Date().toISOString()
        });
        this.setSharingRules(rules);
        this.loadShopWarehouseSharing();
        this.notify('Sharing rule saved.', 'success');
        event?.target?.reset();
      });
    },

    /* ----------------------------------------------------------------------- */
    /* Orders & invoices                                                       */
    /* ----------------------------------------------------------------------- */
    renderAutomaticOrdersList() {
      this.onReady(() => {
        const container = document.getElementById('automaticOrdersList');
        if (!container) return;
        const settings = typeof window.getAutoOrderSettings === 'function' ? window.getAutoOrderSettings() : { threshold: 20 };
        const threshold = Number(settings.threshold || 20);
        const candidates = [];
        this.getCountryStock().forEach((item) => {
          if (Number(item.quantity || 0) <= threshold) {
            candidates.push({
              location: 'Country Stock',
              product: item.description,
              quantity: item.quantity
            });
          }
        });
        Object.entries(this.getWarehouseStock()).forEach(([warehouse, list]) => {
          list.forEach((item) => {
            if (Number(item.quantity || 0) <= threshold) {
              candidates.push({
                location: warehouse === 'windhoek' ? 'Windhoek Warehouse' : 'Ondangwa Warehouse',
                product: item.description,
                quantity: item.quantity
              });
            }
          });
        });
        container.innerHTML = candidates.length
          ? candidates
              .slice(0, 5)
              .map(
                (entry) => `
            <div style="border-bottom:1px solid #e2e8f0;padding:8px 0;">
              <strong>${this.escapeHtml(entry.product)}</strong>
              <div style="color:#475569;font-size:0.9rem;">${entry.location} • ${entry.quantity} units left</div>
            </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">All monitored products are above the reorder threshold.</p>';
      });
    },

    renderManualOrdersList() {
      this.onReady(() => {
        const container = document.getElementById('manualOrdersList');
        if (!container) return;
        let orders = [];
        try {
          if (typeof window.getStoredPurchaseOrders === 'function') {
            orders = window.getStoredPurchaseOrders() || [];
          } else if (window.STOCK_STORAGE_KEYS?.purchaseOrders) {
            orders = this.readStorage(window.STOCK_STORAGE_KEYS.purchaseOrders, []);
          }
        } catch (_) {
          orders = [];
        }
        container.innerHTML = orders.length
          ? orders
              .slice(0, 5)
              .map(
                (order) => `
            <div style="border-bottom:1px solid #e2e8f0;padding:8px 0;">
              <strong>${this.escapeHtml(order.id || order.poNumber || 'PO')}</strong>
              <div style="color:#475569;">${this.escapeHtml(order.supplier || 'Supplier')}</div>
              <div style="color:#94a3b8;font-size:0.85rem;">${order.items?.length || 0} lines • ${this.formatCurrency(order.value || 0)}</div>
            </div>`
              )
              .join('')
          : '<p style="text-align:center;color:#7f8c8d;">No manual purchase orders yet.</p>';
      });
    },

    loadStockOrders() {
      this.renderAutomaticOrdersList();
      this.renderManualOrdersList();
    },

    getInvoiceFilters() {
      return {
        branch: document.getElementById('invoiceReportBranch')?.value || 'all',
        range: document.getElementById('invoiceReportRange')?.value || 'monthly'
      };
    },

    filterInvoices(filters, searchTerm) {
      const rangeMap = { daily: 1, weekly: 7, monthly: 30, quarterly: 90, yearly: 365 };
      const days = rangeMap[filters.range] || 30;
      const startDate = new Date(Date.now() - days * 86400000);
      return this.getInvoices().filter((invoice) => {
        const branchMatch = filters.branch === 'all' || (invoice.branch || '').toLowerCase() === filters.branch.toLowerCase();
        const dateMatch = new Date(invoice.date || Date.now()) >= startDate;
        const searchMatch =
          !searchTerm ||
          (invoice.number || '').toLowerCase().includes(searchTerm) ||
          (invoice.client || '').toLowerCase().includes(searchTerm) ||
          (invoice.branch || '').toLowerCase().includes(searchTerm);
        return branchMatch && dateMatch && searchMatch;
      });
    },

    renderInvoiceReports() {
      this.onReady(() => {
        const branchSelect = document.getElementById('invoiceReportBranch');
        const rangeSelect = document.getElementById('invoiceReportRange');
        const tbody = document.getElementById('invoiceReportTableBody');
        if (!branchSelect || !rangeSelect || !tbody) return;
        const filters = this.getInvoiceFilters();
        const searchTerm = (this.state.invoiceSearch || '').toLowerCase();
        const invoices = this.filterInvoices(filters, searchTerm);
        this.state.filteredInvoices = invoices;
        this.state.visibleInvoiceIds = invoices.map((invoice) => invoice.id);

        const branches = Array.from(new Set(this.getInvoices().map((invoice) => invoice.branch || 'Unknown')));
        const currentBranch = filters.branch;
        branchSelect.innerHTML = '<option value="all">All Branches</option>';
        branches.forEach((branch) => {
          const option = document.createElement('option');
          option.value = branch.toLowerCase();
          option.textContent = branch;
          branchSelect.appendChild(option);
        });
        branchSelect.value = currentBranch;

        const totalCountEl = document.getElementById('invoiceReportTotalCount');
        const grossSalesEl = document.getElementById('invoiceReportGrossSales');
        const refundsEl = document.getElementById('invoiceReportRefunds');
        if (totalCountEl) totalCountEl.textContent = `${invoices.length}`;
        const gross = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
        const refunds = invoices.reduce((sum, invoice) => sum + Number(invoice.refunded || 0), 0);
        if (grossSalesEl) grossSalesEl.textContent = this.formatCurrency(gross);
        if (refundsEl) refundsEl.textContent = this.formatCurrency(refunds);

        if (!invoices.length) {
          tbody.innerHTML =
            '<tr><td colspan="8" class="muted" style="padding:16px;text-align:center;">No invoices available for the selected filters.</td></tr>';
          return;
        }

        tbody.innerHTML = invoices
          .map(
            (invoice) => `
          <tr>
            <td style="width:40px;text-align:center;">
              <input type="checkbox" class="invoice-row-select" value="${invoice.id}" ${
                this.state.invoiceSelection.has(invoice.id) ? 'checked' : ''
              } onclick="toggleSelectAllInvoices()">
            </td>
            <td>${this.escapeHtml(invoice.number || invoice.id)}</td>
            <td>${this.escapeHtml(invoice.client || 'Client')}</td>
            <td>${this.escapeHtml(invoice.branch || 'Branch')}</td>
            <td>${this.formatCurrency(invoice.amount || 0)}</td>
            <td>${this.escapeHtml(invoice.channel || 'walk-in')}</td>
            <td>${new Date(invoice.date || Date.now()).toLocaleDateString()}</td>
            <td style="width:120px;text-align:right;">${invoice.refunded ? `Refunded ${this.formatCurrency(invoice.refunded)}` : '-'}</td>
          </tr>`
          )
          .join('');
      });
    },

    debounceInvoiceSearch() {
      this.onReady(() => {
        const input = document.getElementById('invoiceReportSearch');
        if (!input) return;
        const value = input.value || '';
        if (this.state.invoiceSearchTimer) {
          clearTimeout(this.state.invoiceSearchTimer);
        }
        this.state.invoiceSearchTimer = window.setTimeout(() => {
          this.state.invoiceSearch = value;
          this.renderInvoiceReports();
        }, 250);
      });
    },

    toggleSelectAllInvoices(checked) {
      this.onReady(() => {
        const checkboxes = document.querySelectorAll('.invoice-row-select');
        if (checked === true) {
          this.state.invoiceSelection = new Set(this.state.visibleInvoiceIds || []);
          checkboxes.forEach((cb) => (cb.checked = true));
          return;
        }
        if (checked === false) {
          this.state.invoiceSelection.clear();
          checkboxes.forEach((cb) => (cb.checked = false));
          return;
        }
        checkboxes.forEach((cb) => {
          if (cb.checked) {
            this.state.invoiceSelection.add(cb.value);
          } else {
            this.state.invoiceSelection.delete(cb.value);
          }
        });
      });
    },

    printInvoices(mode) {
      this.onReady(() => {
        const invoices =
          mode === 'selected'
            ? this.getInvoices().filter((invoice) => this.state.invoiceSelection.has(invoice.id))
            : this.state.filteredInvoices || [];
        if (!invoices.length) {
          this.notify(
            mode === 'selected' ? 'Select at least one invoice first.' : 'No invoices available to print.',
            'warning'
          );
          return;
        }
        const win = window.open('', '_blank');
        if (!win) {
          this.notify('Popup blocked. Please allow popups to print invoices.', 'error');
          return;
        }
        const rows = invoices
          .map(
            (invoice) => `
            <tr>
              <td>${this.escapeHtml(invoice.number || invoice.id)}</td>
              <td>${this.escapeHtml(invoice.client || '')}</td>
              <td>${this.escapeHtml(invoice.branch || '')}</td>
              <td>${this.formatCurrency(invoice.amount || 0)}</td>
              <td>${this.escapeHtml(invoice.channel || '')}</td>
              <td>${new Date(invoice.date || Date.now()).toLocaleDateString()}</td>
            </tr>`
          )
          .join('');
        win.document.write(`
          <html>
            <head>
              <title>Invoices</title>
              <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
                th { background: #f8fafc; }
              </style>
            </head>
            <body>
              <h2>Invoice Report (${mode === 'selected' ? 'Selected' : 'Filtered'})</h2>
              <table>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Client</th>
                    <th>Branch</th>
                    <th>Amount</th>
                    <th>Channel</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
              <script>window.print();</script>
            </body>
          </html>
        `);
        win.document.close();
      });
    },

    /* ----------------------------------------------------------------------- */
    /* Help modal                                                              */
    /* ----------------------------------------------------------------------- */
    installHelpModal() {
      this.onReady(() => {
        const openBtn = document.getElementById('stockHelpBtnGlobal');
        const modal = document.getElementById('stockHelpModal');
        const closeBtn = document.getElementById('stockHelpClose');
        if (!openBtn || !modal) return;
        const body = document.getElementById('stockHelpBody');
        const openModal = () => {
          modal.style.display = 'flex';
          if (body) {
            body.innerHTML = this.buildHelpContent();
          }
        };
        const closeModal = () => {
          modal.style.display = 'none';
        };
        openBtn.addEventListener('click', openModal);
        closeBtn?.addEventListener('click', closeModal);
        modal.addEventListener('click', (event) => {
          if (event.target === modal) closeModal();
        });
      });
    },

    buildHelpContent() {
      return `
        <h3 style="margin-top:0;">Stock Workflow Cheatsheet</h3>
        <ol style="line-height:1.6;color:#475569;">
          <li><strong>Import</strong> new batches using the Country Import table.</li>
          <li><strong>Transfer</strong> stock from Country ➜ Warehouses using the Warehouse tab.</li>
          <li><strong>Distribute</strong> from Warehouses ➜ Branches under Branch Distribution.</li>
          <li>Review <strong>Inventory & KPIs</strong> inside the Overview and Country Inventory tabs.</li>
          <li>Use <strong>Orders</strong> to keep automatic / manual supply plans in sync.</li>
        </ol>
        <p style="color:#94a3b8;font-size:0.85rem;">Need a deeper dive? Ping the GM portal team for full SOPs.</p>
      `;
    }
  };

  const API_EXPORTS = {
    loadStockData: () => StockPortal.loadStockData(),
    saveStockData: () => StockPortal.saveStockData(),
    displayCountryStock: () => StockPortal.displayCountryStock(),
    searchCountryStock: () => StockPortal.searchCountryStock(),
    displayCountryStockInventory: () => StockPortal.displayCountryStockInventory(),
    renderInventoryTimelyReport: (range) => StockPortal.renderInventoryTimelyReport(range),
    displayWindhoekStock: () => StockPortal.displayWindhoekStock(),
    searchWindhoekStock: () => StockPortal.searchWindhoekStock(),
    showLowStockWindhoek: () => StockPortal.showLowStockWindhoek(),
    displayOndangwaStock: () => StockPortal.displayOndangwaStock(),
    handleBulkStockImportSubmit: (event) => StockPortal.handleBulkStockImportSubmit(event),
    addStockImportRow: (trigger) => StockPortal.addStockImportRow(trigger),
    removeStockImportRow: (trigger) => StockPortal.removeStockImportRow(trigger),
    importFromCSV: (trigger) => StockPortal.importFromCSV(trigger),
    clearStockImportForm: (trigger) => StockPortal.clearStockImportForm(trigger),
    handleQualitySubmit: (event) => StockPortal.handleQualitySubmit(event),
    renderQualityList: () => StockPortal.renderQualityList(),
    handleTransferToWindhoek: (event) => StockPortal.handleTransferToWindhoek(event),
    handleTransferToOndangwa: (event) => StockPortal.handleTransferToOndangwa(event),
    handleBranchDistribution: (event) => StockPortal.handleBranchDistribution(event),
    handleStockTransfer: (event) => StockPortal.handleStockTransfer(event),
    loadStockTransfers: () => StockPortal.loadStockTransfers(),
    loadBranchesForDistribution: () => StockPortal.loadBranchesForDistribution(),
    populateBranchDistributionProducts: () => StockPortal.populateBranchDistributionProducts(),
    populateTransferBranchOptions: () => StockPortal.populateTransferBranchOptions(),
    loadWindhoekProducts: () => StockPortal.loadWindhoekProducts(),
    loadOndangwaProducts: () => StockPortal.loadOndangwaProducts(),
    loadTransferFromProducts: () => StockPortal.loadTransferFromProducts(),
    updateWindhoekAvailableQuantity: () => StockPortal.updateWindhoekAvailableQuantity(),
    updateOndangwaAvailableQuantity: () => StockPortal.updateOndangwaAvailableQuantity(),
    updateBranchDistAvailableQty: () => StockPortal.updateBranchDistAvailableQty(),
    displayDistributionHistory: () => StockPortal.displayDistributionHistory(),
    searchDistribution: () => StockPortal.searchDistribution(),
    displayInventoryMovements: () => StockPortal.displayInventoryMovements(),
    filterInventoryMovements: () => StockPortal.filterInventoryMovements(),
    exportInventoryMovements: () => StockPortal.exportInventoryMovements(),
    renderAutomaticOrdersList: () => StockPortal.renderAutomaticOrdersList(),
    renderManualOrdersList: () => StockPortal.renderManualOrdersList(),
    loadStockOrders: () => StockPortal.loadStockOrders(),
    renderInvoiceReports: () => StockPortal.renderInvoiceReports(),
    debounceInvoiceSearch: () => StockPortal.debounceInvoiceSearch(),
    toggleSelectAllInvoices: (checked) => StockPortal.toggleSelectAllInvoices(checked),
    printInvoices: (mode) => StockPortal.printInvoices(mode),
    loadShopWarehouseSharing: () => StockPortal.loadShopWarehouseSharing(),
    populateSharingLocations: () => StockPortal.populateSharingLocations(),
    handleSharingRule: (event) => StockPortal.handleSharingRule(event),
    renderASNList: () => StockPortal.renderASNList(),
    renderPutawayQueue: () => StockPortal.renderPutawayQueue(),
    renderWarehouseCapacity: () => StockPortal.renderWarehouseCapacity(),
    renderReplenishmentSuggestions: () => StockPortal.renderReplenishmentSuggestions(),
    renderBranchRequestList: () => StockPortal.renderBranchRequestList(),
    updateBranchMetrics: () => StockPortal.updateBranchMetrics(),
    renderReturnsList: () => StockPortal.renderReturnsList(),
    renderRouteBoard: () => StockPortal.renderRouteBoard(),
    renderInventoryAlerts: () => StockPortal.renderInventoryAlerts(),
    renderReorderScenarioResults: () => StockPortal.renderReorderScenarioResults()
  };

  Object.entries(API_EXPORTS).forEach(([name, fn]) => {
    window[name] = fn;
  });

  window.StockPortalHandlers = StockPortal;
  StockPortal.ensureInit();
})(window, document);

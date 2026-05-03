const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  if (config.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  const res = await fetch(url, config);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  get: (endpoint) => request(endpoint),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body }),
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),

  auth: {
    login: (username, password) => api.post('/auth/login', { username, password }),
    logout: () => api.post('/auth/logout', {}),
    me: () => api.get('/auth/me'),
    register: (data) => api.post('/auth/register', data),
  },

  products: {
    list: () => api.get('/products'),
    get: (id) => api.get(`/products?id=${encodeURIComponent(id)}`),
    create: (data) => api.post('/products', data),
    update: (id, data) => api.put('/products', { ...data, id }),
    delete: (id) => request(`/products?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    uploadImage: (data) => api.post('/products', { action: 'uploadImage', ...data }),
    deleteImage: (imageId) => request(`/products?id=${encodeURIComponent(imageId)}&type=image`, { method: 'DELETE' }),
  },

  branches: {
    list: () => api.get('/branches'),
    create: (data) => api.post('/branches', data),
    update: (id, data) => api.put(`/branches/${id}`, data),
  },

  campaigns: {
    list: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/campaigns${qs ? '?' + qs : ''}`); },
    get: (id) => api.get(`/campaigns/${id}`),
    enroll: (id, data) => api.post(`/campaigns/${id}/participants`, data),
  },

  orders: {
    list: (params) => {
      const qs = params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v != null))).toString() : '';
      return api.get('/orders' + qs);
    },
    create: (data) => api.post('/orders', data),
    update: (id, data) => api.put('/orders', { ...data, id }),
    delete: (id) => api.delete(`/orders?id=${encodeURIComponent(id)}`),
  },

  distributors: {
    list: () => api.get('/distributors'),
    get: (id) => api.get(`/distributors/${id}`),
    create: (data) => api.post('/distributors', data),
    update: (id, data) => api.put('/distributors', { ...data, id }),
    search: (q, activeOnly = false) => api.get(`/distributors/search?q=${encodeURIComponent(q)}&activeOnly=${activeOnly}`),
    byNb: (nb) => api.get(`/distributors/by-nb/${encodeURIComponent(nb)}`),
    bonuses: (nb) => nb ? api.get(`/distributor/bonus?nb=${encodeURIComponent(nb)}`) : api.get('/distributor/bonus'),
  },

  appointments: {
    list: (params = '') => api.get(`/appointments${params ? '?' + params : ''}`),
    byReferral: (nb) => api.get(`/appointments?referral_nb=${encodeURIComponent(nb)}&limit=500`),
    create: (data) => api.post('/appointments', data),
    update: (id, data) => api.put('/appointments', { ...data, id }),
    delete: (id) => api.delete(`/appointments?id=${encodeURIComponent(id)}`),
  },

  clients: {
    list: () => api.get('/clients'),
    create: (data) => api.post('/clients', data),
    update: (id, data) => api.put('/clients', { ...data, id }),
  },

  employees: {
    list: () => api.get('/employees'),
    create: (data) => api.post('/employees', data),
    update: (id, data) => api.put(`/employees/${id}`, data),
    delete: (id) => api.delete(`/employees/${id}`),
  },

  users: {
    list: () => api.get('/users'),
    create: (data) => api.post('/users', data),
    update: (id, data) => api.put('/users', { ...data, id }),
    delete: (id) => request(`/users?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  notifications: {
    list: (params = '') => api.get(`/notifications${params ? '?' + params : ''}`),
    listSince: (recipientId, since) => api.get(`/notifications?recipient_id=${encodeURIComponent(recipientId)}&since=${encodeURIComponent(since)}`),
    create: (data) => api.post('/notifications', data),
    markRead: (id, recipientId) => request('/notifications', { method: 'PUT', body: { id, recipient_id: recipientId, read: true } }),
    markAllRead: (recipientId) => request('/notifications', { method: 'PUT', body: { markAllRead: true, recipient_id: recipientId } }),
  },

  version: {
    check: () => api.get('/version'),
  },

  stock: {
    batches: () => api.get('/stock-batches'),
    createBatch: (data) => api.post('/stock-batches', data),
    updateBatch: (id, data) => api.put('/stock-batches', { ...data, id }),
    movements: (params = '') => api.get(`/stock-movements${params ? '?' + params : ''}`),
    createMovement: (data) => api.post('/stock-movements', data),
    approveWriteoff: (id, data = {}) => api.put('/stock-movements', { ...data, id, action: 'approve' }),
    rejectWriteoff: (id, data = {}) => api.put('/stock-movements', { ...data, id, action: 'reject' }),
    disposeWriteoff: (id, data = {}) => api.put('/stock-movements', { ...data, id, action: 'dispose' }),
    disposeAllWriteoffs: (ids, data = {}) => api.put('/stock-movements', { ...data, ids, action: 'dispose_all' }),
    transfers: (params = '') => api.get(`/stock/transfers${params ? '?' + params : ''}`),
    createTransfer: (data) => api.post('/stock/transfers', data),
    updateTransfer: (id, data) => api.put('/stock/transfers', { ...data, id }),
    requests: (params = '') => api.get(`/stock-requests${params ? '?' + params : ''}`),
    createRequest: (data) => api.post('/stock-requests', data),
    updateRequest: (id, data) => api.put('/stock-requests', { ...data, id }),
    supplierImports: (params = '') => api.get(`/supplier-imports${params ? '?' + params : ''}`),
    createSupplierImport: (data) => api.post('/supplier-imports', data),
    updateSupplierImport: (id, data) => api.put('/supplier-imports', { ...data, id }),
    supplierOrders: (params = '') => api.get(`/stock/supplier-orders${params ? '?' + params : ''}`),
    createSupplierOrder: (data) => api.post('/stock/supplier-orders', data),
    updateSupplierOrder: (id, data) => api.patch('/stock/supplier-orders', { ...data, id }),
    deleteSupplierOrder: (id) => api.delete(`/stock/supplier-orders?id=${id}`),
    fieldStock: (params = '') => api.get(`/field-stock${params ? '?' + params : ''}`),
    createFieldStock: (data) => api.post('/field-stock', data),
    updateFieldStock: (id, data) => api.put('/field-stock', { ...data, id }),
    warehouseInventory: (params = '') => api.get(`/warehouse/inventory${params ? '?' + params : ''}`),
    branchInventory: (params = '') => api.get(`/branch/inventory${params ? '?' + params : ''}`),
    overview: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/overview${qs ? '?' + qs : ''}`); },
    aiCommand: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/ai-command${qs ? '?' + qs : ''}`); },
    aiReorder: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/ai-reorder${qs ? '?' + qs : ''}`); },
    countryStock: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/country-stock${qs ? '?' + qs : ''}`); },
    countryStockItems: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/country-stock/items${qs ? '?' + qs : ''}`); },
    releaseToWarehouse: (data) => api.post('/stock/country-stock/release', data),
    inventory: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/inventory${qs ? '?' + qs : ''}`); },
    orders: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/orders${qs ? '?' + qs : ''}`); },
    createOrder: (data) => api.post('/stock/orders', data),
    updateOrder: (data) => api.patch('/stock/orders', data),
    distribution: () => api.get('/stock/distribution'),
    distributionRequests: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/distribution/requests${qs ? '?' + qs : ''}`); },
    distributionPending: () => api.get('/stock/distribution/pending'),
    barcode: (barcode) => api.get(`/stock/barcode?barcode=${encodeURIComponent(barcode)}`),
    barcodeSearch: (search) => api.get(`/stock/barcode?search=${encodeURIComponent(search)}`),
    realtime: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/realtime${qs ? '?' + qs : ''}`); },
    editRequests: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/edit-requests${qs ? '?' + qs : ''}`); },
    createEditRequest: (data) => api.post('/stock/edit-requests', data),
    fieldStockNew: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/field-stock${qs ? '?' + qs : ''}`); },
    adjustments: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock-adjustments${qs ? '?' + qs : ''}`); },
    approveAdjustment: (id, data = {}) => api.patch(`/stock-adjustments/${id}/approve`, data),
    rejectAdjustment: (id, data = {}) => api.patch(`/stock-adjustments/${id}/reject`, data),
    valuation: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/valuation${qs ? '?' + qs : ''}`); },
    valuationLocations: () => api.get('/stock/valuation/locations'),
    valuationProducts: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/valuation/products${qs ? '?' + qs : ''}`); },
    monthlySales: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/monthly-sales${qs ? '?' + qs : ''}`); },
    monthlySalesBranches: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/monthly-sales/branches${qs ? '?' + qs : ''}`); },
    monthlySalesProducts: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/monthly-sales/products${qs ? '?' + qs : ''}`); },
    warehouse: (wh, sub, params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/warehouses/${wh}/${sub}${qs ? '?' + qs : ''}`); },
    warehouseSummary: (wh) => api.get(`/stock/warehouses/${wh}/summary`),
    warehouseInventoryNew: (wh, params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/warehouses/${wh}/inventory${qs ? '?' + qs : ''}`); },
    warehouseIncoming: (wh) => api.get(`/stock/warehouses/${wh}/incoming`),
    warehouseOutbound: (wh) => api.get(`/stock/warehouses/${wh}/outbound`),
    warehouseMovements: (wh) => api.get(`/stock/warehouses/${wh}/movements`),
    reportsSummary: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/reports/summary${qs ? '?' + qs : ''}`); },
    reportsBranchStock: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/reports/branch-stock${qs ? '?' + qs : ''}`); },
    reportsMovements: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/reports/movements${qs ? '?' + qs : ''}`); },
    reportsExpiry: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/reports/expiry${qs ? '?' + qs : ''}`); },
    reportsLowStock: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/reports/low-stock${qs ? '?' + qs : ''}`); },
    reportsCompany: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/stock/reports/company${qs ? '?' + qs : ''}`); },
  },

  branch: {
    cashSessions: (params = '') => api.get(`/branch/cash-sessions${params ? '?' + params : ''}`),
    createCashSession: (data) => api.post('/branch/cash-sessions', data),
    walkinSales: (params = '') => api.get(`/branch/walkin-sales${params ? '?' + params : ''}`),
    walkinSalesByDistributor: (nb) => api.get(`/branch/walkin-sales?distributor_nb=${encodeURIComponent(nb)}&limit=500`),
    distributorProfit: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/branch/distributor-profit${qs ? '?' + qs : ''}`); },
    distributorProfitGroups: (params = {}) => { const qs = new URLSearchParams({ ...params, grouped: 'true' }).toString(); return api.get(`/branch/distributor-profit?${qs}`); },
    referredSales: (nb) => api.get(`/branch/distributor-profit/referred-sales?distributor_nb=${encodeURIComponent(nb)}`),
    payDistributorProfit: (distributorNb, branchId, data) => api.post('/branch/distributor-profit/pay-all', { distributor_nb: distributorNb, branch_id: branchId, ...data }),
    createWalkinSale: (data) => api.post('/branch/walkin-sales', data),
    cashMovements: () => api.get('/branch/cash-movements'),
    createCashMovement: (data) => api.post('/branch/cash-movements', data),
    deposits: (params = '') => api.get(`/branch/deposits${params ? '?' + params : ''}`),
    createDeposit: (data) => api.post('/branch/deposits', data),
    verifyDeposit: (id, notes = '') => api.patch('/branch/deposits', { id, status: 'approved', decisionNotes: notes }),
    rejectDeposit: (id, notes = '') => api.patch('/branch/deposits', { id, status: 'rejected', decisionNotes: notes }),
    expenses: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/branch/expenses${qs ? '?' + qs : ''}`); },
    createExpense: (data) => api.post('/branch/expenses', data),
    payments: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/branch/payments${qs ? '?' + qs : ''}`); },
    createPayment: (data) => api.post('/branch/payments', data),
    inventory: (params = '') => api.get(`/branch/inventory${params ? '?' + params : ''}`),
    receiveInventory: (data) => api.post('/branch/inventory', data),
    dispense: (data) => api.post('/branch/dispense', data),
    captureRx: (data) => api.post('/branch/capture-rx', data),
    stockSummary: (params = '') => api.get(`/branch/stock-summary${params ? '?' + params : ''}`),
    bonusPayments: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/branch/bonus-payments${qs ? '?' + qs : ''}`); },
    recordBonusPayment: (data) => api.post('/branch/bonus-payments', data),
    campaignSale: (data) => api.post('/branch/campaign-sale', data),
  },

  branchActivity: {
    capture: (data) => api.post('/branch-activity/capture', data),
    list: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/branch-activity/capture${qs ? '?' + qs : ''}`); },
    dailyReport: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/reports/branch-sales/daily${qs ? '?' + qs : ''}`); },
    checkin: (data) => api.post('/branch-client-visits/checkin', data),
    visits: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/branch-client-visits/checkin${qs ? '?' + qs : ''}`); },
    rebuildReport: (data) => api.post('/jobs/rebuild-daily-branch-report', data),
  },

  reports: {
    list: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/reports${qs ? '?' + qs : ''}`); },
    create: (data) => api.post('/reports', data),
    update: (id, data) => api.put('/reports', { ...data, id }),
    branchSalesDaily: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/reports/branch-sales/daily${qs ? '?' + qs : ''}`); },
    branchSalesMonthly: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/reports/branch-sales/monthly${qs ? '?' + qs : ''}`); },
    branchStockFormula: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/reports/branch-sales/stock-formula${qs ? '?' + qs : ''}`); },
    branchSalesSummary: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/reports/branch-sales/summary${qs ? '?' + qs : ''}`); },
  },

  admin: {
    pendingRegistrations: () => api.get('/admin/pending-registrations'),
    approveRegistration: (data) => api.post('/admin/approve-registration', data),
    rejectRegistration: (data) => api.post('/admin/reject-registration', data),
  },

  mis: {
    audit: (params = '') => api.get(`/mis/audit${params ? '?' + params : ''}`),
    branchStatus: (date = '') => api.get(`/mis/branch-status${date ? '?date=' + date : ''}`),
    catalogs: () => api.get('/mis/catalogs'),
    drafts: () => api.get('/mis/drafts'),
    encodedSales: (params = '') => api.get(`/mis/encoded-sales${params ? '?' + params : ''}`),
    createEncodedSale: (data) => api.post('/mis/encoded-sales', data),
    receipts: (params = '') => api.get(`/mis/receipts${params ? '?' + params : ''}`),
    reconcile: (body) => api.post('/mis/reconcile', body),
    stock: () => api.get('/mis/stock'),
    stockReport: (params = '') => api.get(`/mis/stock-report${params ? '?' + params : ''}`),
    stockBranch: (branchId, params = '') => api.get(`/mis/stock-report?branch=${branchId}${params ? '&' + params : ''}`),
    csiEntries: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/mis/csi-entries${qs ? '?' + qs : ''}`); },
  },

  prices: {
    list: () => api.get('/prices'),
    update: (id, data) => api.patch(`/prices/${id}`, data),
    bulkUpdate: (updates) => api.put('/prices', updates),
    create: (data) => api.post('/prices', data),
    delete: (id) => api.delete(`/prices/${id}`),
  },

  gm: {
    summary: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/gm/summary${qs ? '?' + qs : ''}`); },
    branchesPerformance: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/gm/branches/performance${qs ? '?' + qs : ''}`); },
    warehousesSummary: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/gm/warehouses/summary${qs ? '?' + qs : ''}`); },
    stockAlerts: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/gm/alerts/stock${qs ? '?' + qs : ''}`); },
    dailySales: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/gm/daily-sales${qs ? '?' + qs : ''}`); },
  },

  finance: {
    summary: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/finance/summary${qs ? '?' + qs : ''}`); },
    branchesSummary: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/finance/branches/summary${qs ? '?' + qs : ''}`); },
    stockValue: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/finance/reports/stock-value${qs ? '?' + qs : ''}`); },
    writeoffs: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/finance/reports/writeoffs${qs ? '?' + qs : ''}`); },
    remittances: () => api.get('/finance/remittances'),
    createRemittance: (data) => api.post('/finance/remittances', data),
    notices: () => api.get('/finance/notices'),
    createNotice: (data) => api.post('/finance/notices', data),
    approveExpense: (id, notes = '') => api.patch('/branch/expenses', { id, status: 'approved', notes }),
    rejectExpense: (id, notes = '') => api.patch('/branch/expenses', { id, status: 'rejected', notes }),
    deposits: (params = '') => api.get(`/branch/deposits${params ? '?' + params : ''}`),
    distributorBonuses: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/finance/distributor-bonuses${qs ? '?' + qs : ''}`); },
    uploadDistributorBonuses: (formData) => request('/finance/distributor-bonuses/upload', { method: 'POST', body: formData }),
    commitDistributorBonuses: (data) => api.post('/finance/distributor-bonus-commit', data),
    distributorBonusHistory: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/finance/distributor-bonus-history${qs ? '?' + qs : ''}`); },
    requestBonusPeriodDelete: (data) => api.post('/finance/distributor-bonuses/delete-request', data),
    getBonusPeriodDeleteRequests: (status = 'pending_gm') => api.get(`/finance/distributor-bonuses/delete-requests?status=${status}`),
    actionBonusPeriodDeleteRequest: (id, data) => api.put(`/finance/distributor-bonuses/delete-request/${id}`, data),
    pettyCash: {
      accounts: () => api.get('/finance/petty-cash/balance'),
      requests: () => api.get('/finance/petty-cash/requests'),
      createRequest: (data) => api.post('/finance/petty-cash/requests', data),
      approve: (id, notes) => api.put(`/finance/petty-cash/requests/${id}/approve`, { notes }),
      reject: (id, notes) => api.put(`/finance/petty-cash/requests/${id}/reject`, { notes }),
      issue: (id, notes) => api.put(`/finance/petty-cash/requests/${id}/issue`, { notes }),
      spend: (data) => api.post('/finance/petty-cash/spend', data),
      transactions: (location) => api.get(`/finance/petty-cash/transactions${location ? '?location=' + location : ''}`),
    },
    rent: {
      list: () => api.get('/finance/rent-payments'),
      add: (data) => api.post('/finance/rent-payments', data),
      proposeEdit: (id, data) => api.put(`/finance/rent-payments/${id}`, data),
      editRequests: (status = 'pending') => api.get(`/finance/rent-payments/edit-requests?status=${status}`),
      reviewEdit: (id, action, review_notes = '') => api.patch(`/finance/rent-payments/edit-requests/${id}`, { action, review_notes }),
    },
  },

  hr: {
    leaves: (params = '') => api.get(`/hr/leaves${params ? '?' + params : ''}`),
    createLeave: (data) => api.post('/hr/leaves', data),
    updateLeave: (id, data) => api.put(`/hr/leaves?id=${id}`, data),
    records: (type) => api.get(`/hr/records${type ? '?type=' + type : ''}`),
    createRecord: (data) => api.post('/hr/records', data),
    salaryLedger: {
      list: () => api.get('/hr/salary-ledger'),
      add: (data) => api.post('/hr/salary-ledger', data),
      proposeEdit: (id, data) => api.put(`/hr/salary-ledger/${id}`, data),
      proposeRemove: (id) => api.delete(`/hr/salary-ledger/${id}`),
      editRequests: (status = 'pending') => api.get(`/hr/salary-ledger/edit-requests?status=${status}`),
      reviewEdit: (id, action, review_notes = '') => api.patch(`/hr/salary-ledger/edit-requests/${id}`, { action, review_notes }),
    },
    staffChangeRequests: {
      list: (status = '') => api.get(`/hr/staff-change-requests${status ? '?status=' + status : ''}`),
      create: (data) => api.post('/hr/staff-change-requests', data),
      review: (id, status, gm_note = '') => api.put(`/hr/staff-change-requests?id=${id}`, { id, status, gm_note }),
    },
  },

  director: {
    summary: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/director/summary${qs ? '?' + qs : ''}`); },
    profitLoss: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/director/profit-loss${qs ? '?' + qs : ''}`); },
    revenueTrends: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/director/revenue-trends${qs ? '?' + qs : ''}`); },
    branchesPerformance: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/director/branches/performance${qs ? '?' + qs : ''}`); },
    fastMoving: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/director/products/fast-moving${qs ? '?' + qs : ''}`); },
    branchFastMoving: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/director/products/fast-moving-by-branch${qs ? '?' + qs : ''}`); },
    branchRevenue: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/director/branches/revenue-contribution${qs ? '?' + qs : ''}`); },
    registrations: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/director/registrations/summary${qs ? '?' + qs : ''}`); },
    profitAnalysis: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/director/products/profit-analysis${qs ? '?' + qs : ''}`); },
  },

  system: {
    buildInfo: () => api.get('/system/build-info'),
    dataMode: () => api.get('/system/data-mode'),
    disableSampleData: () => api.post('/admin/system/disable-sample-data', {}),
    purgeSampleData: () => api.post('/admin/system/purge-sample-data', { confirm: true }),
  },

  sales: {
    nonMember: (data) => api.post('/sales/non-member', data),
    get: (saleId) => api.get(`/sales/${encodeURIComponent(saleId)}`),
    branchReport: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/reports/sales/branch${qs ? '?' + qs : ''}`); },
    companyReport: (params = {}) => { const qs = new URLSearchParams(params).toString(); return api.get(`/reports/sales/company${qs ? '?' + qs : ''}`); },
  },

  consultations: {
    full: (id) => api.get(`/consultations/${encodeURIComponent(id)}/full`),
    preview: (id) => api.get(`/consultations/${encodeURIComponent(id)}/preview`),
    setReportPreference: (id, wants) => api.patch(`/consultations/${encodeURIComponent(id)}/report-preference`, { clientWantsReport: wants }),
  },

  prescriptions: {
    dispense: (id, data) => api.post(`/prescriptions/${encodeURIComponent(id)}/dispense`, data),
    history: (id) => api.get(`/prescriptions/${encodeURIComponent(id)}/dispensing-history`),
    status: (id) => api.get(`/prescriptions/${encodeURIComponent(id)}/status`),
  },

  receipts: {
    render: (receiptId, copyType = 'branch') => api.get(`/receipts/${encodeURIComponent(receiptId)}/render?copyType=${copyType}`),
  },

  paymentVouchers: {
    list: (params = {}) => { const qs = new URLSearchParams(params).toString(); return request(`/payment-vouchers${qs ? '?' + qs : ''}`); },
    create: (data) => request('/payment-vouchers', { method: 'POST', body: data }),
    update: (id, data) => request(`/payment-vouchers/${id}`, { method: 'PATCH', body: data }),
    delete: (id) => request(`/payment-vouchers/${id}`, { method: 'DELETE' }),
    bonusPeriods: () => request('/finance/bonus-periods'),
    bonusSearch: (params = {}) => { const qs = new URLSearchParams(params).toString(); return request(`/finance/bonus-search${qs ? '?' + qs : ''}`); },
  },

  upload: (formData) => request('/upload', { method: 'POST', body: formData }),
  health: () => api.get('/health'),

  statements: {
    listMonths: () => request('/distributor-statements'),
    get: (nb, month) => {
      const qs = new URLSearchParams({ nb });
      if (month) qs.set('month', month);
      return request(`/distributor-statements?${qs}`);
    },
    summarize: (nb) => request(`/distributor-statements?nb=${encodeURIComponent(nb)}&summary=true`),
    upload: (rawContent, month, label) =>
      request('/distributor-statements', { method: 'POST', body: { rawContent, month, label } }),
    delete: (month) =>
      request(`/distributor-statements?month=${encodeURIComponent(month)}`, { method: 'DELETE' }),
  },
};

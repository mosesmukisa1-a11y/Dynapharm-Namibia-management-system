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
  },

  branches: {
    list: () => api.get('/branches'),
    create: (data) => api.post('/branches', data),
    update: (id, data) => api.put(`/branches/${id}`, data),
  },

  orders: {
    list: () => api.get('/orders'),
    create: (data) => api.post('/orders', data),
    update: (id, data) => api.put('/orders', { ...data, id }),
  },

  distributors: {
    list: () => api.get('/distributors'),
    get: (id) => api.get(`/distributors/${id}`),
    create: (data) => api.post('/distributors', data),
    search: (q) => api.get(`/distributors?search=${encodeURIComponent(q)}`),
  },

  appointments: {
    list: (params = '') => api.get(`/appointments${params ? '?' + params : ''}`),
    create: (data) => api.post('/appointments', data),
    update: (id, data) => api.put(`/appointments/${id}`, data),
  },

  clients: {
    list: () => api.get('/clients'),
    create: (data) => api.post('/clients', data),
    update: (id, data) => api.put(`/clients/${id}`, data),
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
    list: () => api.get('/notifications'),
    create: (data) => api.post('/notifications', data),
    markRead: (id) => api.put(`/notifications/${id}`, { read: true }),
  },

  stock: {
    batches: () => api.get('/stock-batches'),
    createBatch: (data) => api.post('/stock-batches', data),
    movements: () => api.get('/stock-movements'),
    createMovement: (data) => api.post('/stock-movements', data),
    transfers: (params = '') => api.get(`/stock/transfers${params ? '?' + params : ''}`),
    createTransfer: (data) => api.post('/stock/transfers', data),
    updateTransfer: (id, data) => api.put(`/stock/transfers/${id}`, data),
    requests: () => api.get('/stock-requests'),
    createRequest: (data) => api.post('/stock-requests', data),
  },

  branch: {
    cashSessions: (params = '') => api.get(`/branch/cash-sessions${params ? '?' + params : ''}`),
    createCashSession: (data) => api.post('/branch/cash-sessions', data),
    walkinSales: (params = '') => api.get(`/branch/walkin-sales${params ? '?' + params : ''}`),
    createWalkinSale: (data) => api.post('/branch/walkin-sales', data),
    cashMovements: () => api.get('/branch/cash-movements'),
    createCashMovement: (data) => api.post('/branch/cash-movements', data),
    deposits: () => api.get('/branch/deposits'),
    createDeposit: (data) => api.post('/branch/deposits', data),
    verifyDeposit: (id) => api.put(`/branch/deposits/${id}`, { status: 'verified' }),
    expenses: () => api.get('/branch/expenses'),
    createExpense: (data) => api.post('/branch/expenses', data),
    payments: () => api.get('/branch/payments'),
    createPayment: (data) => api.post('/branch/payments', data),
    inventory: (params = '') => api.get(`/branch/inventory${params ? '?' + params : ''}`),
  },

  reports: {
    list: () => api.get('/reports'),
    create: (data) => api.post('/reports', data),
  },

  admin: {
    pendingRegistrations: () => api.get('/admin/pending-registrations'),
    approveRegistration: (data) => api.post('/admin/approve-registration', data),
    rejectRegistration: (data) => api.post('/admin/reject-registration', data),
  },

  mis: {
    audit: (params = '') => api.get(`/mis/audit${params ? '?' + params : ''}`),
    branchStatus: () => api.get('/mis/branch-status'),
    catalogs: () => api.get('/mis/catalogs'),
    drafts: () => api.get('/mis/drafts'),
    encodedSales: (params = '') => api.get(`/mis/encoded-sales${params ? '?' + params : ''}`),
    createEncodedSale: (data) => api.post('/mis/encoded-sales', data),
    receipts: (params = '') => api.get(`/mis/receipts${params ? '?' + params : ''}`),
    reconcile: (params = '') => api.get(`/mis/reconcile${params ? '?' + params : ''}`),
    stock: () => api.get('/mis/stock'),
  },

  upload: (formData) => request('/upload', { method: 'POST', body: formData }),
  health: () => api.get('/health'),
};

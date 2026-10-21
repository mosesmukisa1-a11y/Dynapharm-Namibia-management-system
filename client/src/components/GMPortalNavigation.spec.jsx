import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import GMPortal from '../pages/portals/GMPortal';
import { ProtectedRoute } from './ProtectedRoute';
import { api } from '../lib/api';

const auth = vi.hoisted(() => ({
  user: { role: 'gm' },
  hasPortalAccess: vi.fn(() => true),
  loading: false,
}));
vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(async url => {
      if (url.includes('stock-adjustments')) return [{ id: 'synthetic-pending' }];
      if (url === '/stock/branch-clearance') return { branches: [], history: [] };
      if (url === '/stock/current-overview') return { products: [], zeroStockProducts: [], summary: {} };
      return [];
    }),
    prices: {
      list: vi.fn(async () => []),
      pending: vi.fn(async () => ({ pending: [] })),
      history: vi.fn(async () => []),
      analytics: vi.fn(async () => ({ products: [] })),
    },
    gm: { summary: vi.fn(async () => ({})), dailySales: vi.fn(async () => ({})) },
    orders: { list: vi.fn(async () => []) },
    branches: { list: vi.fn(async () => []) },
    products: { list: vi.fn(async () => []) },
    statements: { listMonths: vi.fn(async () => ({ months: [] })) },
    branch: { cashMovements: vi.fn(async () => []), walkinSales: vi.fn(async () => []) },
    stock: {
      requests: vi.fn(async () => []),
      transfers: vi.fn(async () => []),
      discrepancies: vi.fn(async () => []),
      costReport: vi.fn(async () => ({ rows: [] })),
      listRefundRequests: vi.fn(async () => ({ refunds: [] })),
    },
    finance: {
      pettyCash: { requests: vi.fn(async () => ({ requests: [] })), accounts: vi.fn(async () => ({ accounts: [] })) },
      rent: { editRequests: vi.fn(async () => ({ requests: [] })) },
      getBonusPeriodDeleteRequests: vi.fn(async () => ({ requests: [] })),
      notices: vi.fn(async () => []),
      stockValue: vi.fn(async () => ({})),
      remittances: vi.fn(async () => []),
    },
    hr: {
      salaryLedger: { editRequests: vi.fn(async () => ({ requests: [] })) },
      staffChangeRequests: { list: vi.fn(async () => ({ requests: [] })) },
    },
    director: { profitAnalysis: vi.fn(async () => ({ products: [] })) },
    appointments: { list: vi.fn(async () => []) },
  },
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../hooks/useStockRealtime', () => ({ useStockRealtime: () => ({ connected: false }) }));
vi.mock('../hooks/useBranchDashboardReads', () => ({
  useBranchDashboardReads: sections => ({
    reads: Object.fromEntries(sections.map(section => [section, { rows: [], failures: [], loading: false }])),
    retry: vi.fn(),
  }),
}));
let host, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('React', React);
  vi.clearAllMocks();
  auth.user = { role: 'gm' };
  auth.hasPortalAccess.mockReturnValue(true);
  window.history.replaceState(null, '', '/gm');
  vi.stubGlobal('requestAnimationFrame', callback => { callback(); return 0; });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const section = label => [...host.querySelectorAll('aside nav button')].find(button => button.textContent.includes(label));
const renderPortal = async () => {
  await act(async () => root.render(
    <BrowserRouter>
      <ProtectedRoute portalId="gm"><GMPortal /></ProtectedRoute>
    </BrowserRouter>,
  ));
};
const travel = async direction => {
  await act(async () => {
    const popped = new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }));
    window.history.go(direction);
    await popped;
  });
};

it('connects the complete existing GM list to the real Statements and Bonus screens without writes', async () => {
  await renderPortal();
  expect(host.querySelectorAll('aside nav button')).toHaveLength(20);
  expect(section('Stock Edits').textContent).toContain('(1)');
  await act(async () => section('Statements').click());
  expect(api.statements.listMonths).toHaveBeenCalledTimes(1);
  expect(host.querySelector('input[type="file"]')).not.toBeNull();
  expect(host.textContent).toContain('Upload');
  expect(section('Statements').getAttribute('aria-current')).toBe('page');
  await act(async () => host.querySelector('[aria-label="Refresh Statements"]').click());
  expect(api.statements.listMonths).toHaveBeenCalledTimes(2);
  await act(async () => section('Statements').click());
  expect(api.statements.listMonths).toHaveBeenCalledTimes(3);
  await act(async () => section('Bonus History').click());
  expect(host.textContent).toContain('Bonus Periods');
  expect(api.get).toHaveBeenCalledWith('/finance/bonus-periods');
  await act(async () => section('Statements').click());
  expect(api.statements.listMonths).toHaveBeenCalledTimes(4);
  expect(api.get.mock.calls.every(([url]) => ['/stock-adjustments?status=pending', '/finance/bonus-periods'].includes(url))).toBe(true);
});

const destinations = [
  ['dashboard', 'Dashboard'], ['approvals', 'Approvals'], ['stockAdjustments', 'Stock Edits'],
  ['priceList', 'Price List'], ['priceAdvisor', 'Price Advisor'], ['campaigns', 'Campaigns'],
  ['profitAnalysis', 'Profit Analysis'], ['currentStock', 'Current Stock'],
  ['originalCosts', 'Original Costs & Profit'], ['controlledOperations', 'Controlled Counts & Returns'],
  ['historicalRefunds', 'Historical Refund Evidence'], ['accounts', 'Accounts'], ['bonus', 'Bonus History'],
  ['statements', 'Statements'], ['communication', 'Communication'], ['staff', 'Staff Services'],
  ['messages', 'My Messages'], ['distributors', 'Distributor Performance'],
  ['discrepancies', 'Discrepancy Inbox'], ['checkups', 'Check-ups'],
];

it.each(destinations)('opens the existing %s destination from a direct URL', async (id, label) => {
  window.history.replaceState(null, '', `/gm?section=${id}`);
  await renderPortal();
  expect(section(label).getAttribute('aria-current')).toBe('page');
  expect(host.querySelector('[data-gm-section-content]').children.length).toBeGreaterThan(0);
});

it.each(['', '?section=', '?section=unknown', '?section=Statements', '?section=__proto__', '?section=%3Cscript%3E'])(
  'falls back safely to Dashboard for /gm%s', async search => {
    window.history.replaceState(null, '', `/gm${search}`);
    await renderPortal();
    expect(section('Dashboard').getAttribute('aria-current')).toBe('page');
    expect(api.gm.summary).toHaveBeenCalledTimes(1);
    expect(api.statements.listMonths).not.toHaveBeenCalled();
  },
);

it('retains Statements and unrelated URL state when the portal is reloaded', async () => {
  window.history.replaceState(null, '', '/gm?filter=recent#details');
  await renderPortal();
  await act(async () => section('Statements').click());
  expect(window.location.pathname).toBe('/gm');
  expect(new URLSearchParams(window.location.search).get('section')).toBe('statements');
  expect(new URLSearchParams(window.location.search).get('filter')).toBe('recent');
  expect(window.location.hash).toBe('#details');
  await act(async () => root.unmount());
  root = createRoot(host);
  await renderPortal();
  expect(section('Statements').getAttribute('aria-current')).toBe('page');
  expect(host.querySelector('input[type="file"]')).not.toBeNull();
  expect(api.statements.listMonths).toHaveBeenCalledTimes(2);
});

it('follows browser Back and Forward, remounting screens without adding entries on refresh or reselect', async () => {
  await renderPortal();
  await act(async () => section('Statements').click());
  await act(async () => section('Bonus History').click());
  const entries = window.history.length;
  await act(async () => section('Bonus History').click());
  await act(async () => host.querySelector('[aria-label="Refresh Bonus History"]').click());
  expect(window.history.length).toBe(entries);
  expect(api.get.mock.calls.filter(([url]) => url === '/finance/bonus-periods')).toHaveLength(3);

  await travel(-1);
  expect(window.location.search).toBe('?section=statements');
  expect(section('Statements').getAttribute('aria-current')).toBe('page');
  expect(api.statements.listMonths).toHaveBeenCalledTimes(2);
  await travel(-1);
  expect(window.location.search).toBe('');
  expect(section('Dashboard').getAttribute('aria-current')).toBe('page');
  await travel(1);
  expect(section('Statements').getAttribute('aria-current')).toBe('page');
  expect(api.statements.listMonths).toHaveBeenCalledTimes(3);
  await travel(1);
  expect(section('Bonus History').getAttribute('aria-current')).toBe('page');
  expect(window.history.length).toBe(entries);
});

it('returns to an unknown-section history entry as Dashboard without redirecting or looping', async () => {
  window.history.replaceState(null, '', '/gm?section=unknown');
  await renderPortal();
  await act(async () => section('Statements').click());
  await travel(-1);
  expect(window.location.search).toBe('?section=unknown');
  expect(section('Dashboard').getAttribute('aria-current')).toBe('page');
  await travel(1);
  expect(section('Statements').getAttribute('aria-current')).toBe('page');
});

it.each([null, { role: 'finance' }])('keeps direct Statements links protected for %j', async user => {
  auth.user = user;
  auth.hasPortalAccess.mockReturnValue(false);
  window.history.replaceState(null, '', '/gm?section=statements');
  await renderPortal();
  expect(host.textContent).toContain(user ? 'Access Denied' : 'Authentication Required');
  expect(host.querySelector('input[type="file"]')).toBeNull();
  expect(api.statements.listMonths).not.toHaveBeenCalled();
  expect(api.get).not.toHaveBeenCalled();
  expect(api.prices.list).not.toHaveBeenCalled();
});

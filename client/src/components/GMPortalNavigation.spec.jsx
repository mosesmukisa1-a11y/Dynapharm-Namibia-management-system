import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GMPortal from '../pages/portals/GMPortal';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(async url => url.includes('stock-adjustments') ? [{ id: 'synthetic-pending' }] : []),
    prices: { list: vi.fn(async () => []) },
    gm: { summary: vi.fn(async () => ({})), dailySales: vi.fn(async () => ({})) },
    orders: { list: vi.fn(async () => []) },
    branches: { list: vi.fn(async () => []) },
    products: { list: vi.fn(async () => []) },
    statements: { listMonths: vi.fn(async () => ({ months: [] })) },
  },
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'gm' } }) }));
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

it('connects the complete existing GM list to the real Statements and Bonus screens without writes', async () => {
  await act(async () => root.render(<GMPortal />));
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

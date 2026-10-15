import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { useBranchDashboardReads } from '../hooks/useBranchDashboardReads';
import { FINANCE_BRANCH_SECTIONS } from '../lib/authorizedBranchReads';
import BranchReadStatus from './BranchReadStatus';
import DailySalesCard from './DailySalesCard';
vi.mock('../lib/api', () => ({ api: { get: vi.fn(), gm: { dailySales: vi.fn() } } }));
vi.mock('../lib/constants', () => ({
  BRANCH_DETAILS: [{ id: 'townshop', name: 'Windhoek CBD' }, { id: 'swakopmund', name: 'Swakopmund' }],
  BRANCH_ID_TO_NAME: {}, formatCurrency: value => `N$${value}`,
}));
let host, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); vi.clearAllMocks();
  api.gm.dailySales.mockResolvedValue({ success: true, summary: { totalRevenue: 54 }, branches: [] });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
function DashboardProbe() {
  const { reads, retry } = useBranchDashboardReads(FINANCE_BRANCH_SECTIONS);
  return FINANCE_BRANCH_SECTIONS.map(section => <div key={section}>
    <BranchReadStatus section={section} result={reads[section]} retry={() => retry(section)} />
    <span data-failures={section}>{reads[section].failures.length}</span>
    <output data-section={section}>{reads[section].loading ? 'Loading' : reads[section].failures.length ?
      'Incomplete data' : reads[section].rows.reduce((sum, row) => sum + row.amount, 0)}</output>
  </div>);
}
it('keeps rows and failures arrays defined while a real asynchronous branch read is pending', async () => {
  let resolvePending;
  api.get.mockImplementation(url => {
    const key = url.includes('walkin-sales') ? 'sales' : url.includes('deposits') ? 'deposits' : 'expenses';
    if (key === 'deposits' && url.includes('swakopmund')) return new Promise(resolve => { resolvePending = resolve; });
    return Promise.resolve({ [key]: [] });
  });
  await act(async () => root.render(<DashboardProbe />));
  expect(host.querySelector('[data-section=deposits]').textContent).toBe('Loading');
  expect(host.querySelector('[data-failures=deposits]').textContent).toBe('0');
  await act(async () => resolvePending({ deposits: [] }));
  expect(host.querySelector('[data-section=deposits]').textContent).toBe('0');
});
it('shows incomplete affected totals, preserves known rows, and Retry rereads only the affected section', async () => {
  let fail = true;
  api.get.mockImplementation(async url => {
    if (fail && url.includes('/deposits?') && url.includes('swakopmund')) throw Object.assign(Error('Offline'), { status: 503 });
    const key = url.includes('walkin-sales') ? 'sales' : url.includes('deposits') ? 'deposits' : 'expenses';
    return { [key]: [{ id: url, amount: 9 }] };
  });
  await act(async () => root.render(<DashboardProbe />));
  expect(host.querySelector('[data-section=deposits]').textContent).toBe('Incomplete data');
  expect(host.querySelector('[role=alert]').textContent).toContain('Swakopmund');
  expect(host.querySelector('[role=alert]').textContent).toContain('1 known records retained');
  expect(host.querySelector('[data-section=sales]').textContent).toBe('18');
  api.get.mockClear(); fail = false;
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Retry deposits').click());
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(api.get.mock.calls.every(([url]) => url.startsWith('/branch/deposits?'))).toBe(true);
  expect(host.querySelector('[role=alert]')).toBeNull();
  expect(host.querySelector('[data-section=deposits]').textContent).toBe('18');
});
it('has sibling native focusable toggle and Refresh controls with independent behavior and unchanged API', async () => {
  await act(async () => root.render(<DailySalesCard />));
  const toggle = host.querySelector('[aria-label="Expand or collapse daily sales"]');
  const refresh = host.querySelector('[aria-label="Refresh daily sales"]');
  expect(host.querySelector('button button, button input, button a')).toBeNull();
  expect(refresh.parentElement).toBe(toggle.parentElement);
  expect(toggle.tagName).toBe('BUTTON'); expect(toggle.tabIndex).toBe(0);
  toggle.focus(); expect(document.activeElement).toBe(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await act(async () => refresh.click());
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  await act(async () => toggle.click());
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(document.getElementById(toggle.getAttribute('aria-controls'))).not.toBeNull();
  await act(async () => refresh.click());
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  await act(async () => toggle.click());
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(api.gm.dailySales).toHaveBeenCalledTimes(3);
  expect(api.gm.dailySales.mock.calls.every(([params]) => Object.keys(params).join() === 'date')).toBe(true);
});

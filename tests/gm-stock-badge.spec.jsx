// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../client/src/lib/api', () => ({
  api: { get: vi.fn(), prices: { list: vi.fn() } },
}));
vi.mock('../client/src/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../client/src/hooks/useStockRealtime', () => ({ useStockRealtime: vi.fn() }));
vi.mock('../client/src/components/BranchStockClearance', () => ({ default: () => null }));
// Keep unrelated sections' data fetching out of this portal-level contract.
vi.mock('../client/src/components/GMSectionLayout', () => ({
  default: ({ tabs, active, onChange }) => (
    <nav data-active={active}>
      {tabs.map(tab => <button key={tab.id} onClick={() => onChange(tab.id)}>{tab.label}</button>)}
    </nav>
  ),
}));
import GMPortal from '../client/src/pages/portals/GMPortal';
import { api } from '../client/src/lib/api';
import { useAuth } from '../client/src/contexts/AuthContext';
import { useStockRealtime } from '../client/src/hooks/useStockRealtime';

let host, root, previousReact;
const pendingUrl = '/stock-adjustments?status=pending';
const pending = [{ id: 'one', status: 'pending' }, { id: 'two', status: 'pending' }];
const focus = () => act(async () => window.dispatchEvent(new Event('focus')));
const render = () => act(async () => root.render(<GMPortal />));
const deferred = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => {
  previousReact = globalThis.React;
  globalThis.React = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  api.get.mockReset();
  api.get.mockResolvedValue(pending);
  api.prices.list.mockResolvedValue([]);
  useAuth.mockReturnValue({ user: { id: 'gm', role: 'gm' }, hasPortalAccess: id => id === 'gm' });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  globalThis.React = previousReact;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it.each(['approved', 'rejected'])('refreshes only the badge after an external %s review while another section is selected', async status => {
  let records = pending.map(row => ({ ...row }));
  api.get.mockImplementation(async () => records.filter(row => row.status === 'pending'));
  await render();
  expect(host.textContent).toContain('Stock Edits (2)');
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Accounts').click());
  records[0].status = status;
  await focus();
  expect(host.textContent).toContain('Stock Edits (1)');
  expect(host.querySelector('nav').dataset.active).toBe('accounts');
  records[1].status = status;
  await focus();
  expect(host.textContent).toContain('Stock Edits');
  expect(host.textContent).not.toContain('Stock Edits (');
  expect(api.get.mock.calls).toEqual([[pendingUrl], [pendingUrl], [pendingUrl]]);
  expect(api.prices.list).toHaveBeenCalledTimes(1);
  expect(useStockRealtime).not.toHaveBeenCalled();
});

it('removes the same focus listener on unmount and ignores late responses', async () => {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const response = deferred();
  await render();
  api.get.mockReturnValueOnce(response.promise);
  await focus();
  const listeners = add.mock.calls.filter(([type]) => type === 'focus');
  expect(listeners).toHaveLength(1);
  await act(async () => root.unmount());
  root = null;
  expect(remove).toHaveBeenCalledWith('focus', listeners[0][1]);
  await focus();
  await act(async () => response.resolve([]));
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(host.textContent).toBe('');
});

it('keeps the last known count on a failed or malformed response', async () => {
  await render();
  api.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ error: 'unavailable' });
  await focus();
  await focus();
  expect(host.textContent).toContain('Stock Edits (2)');
});

it('does not let an older response overwrite a newer count', async () => {
  await render();
  const older = deferred();
  api.get.mockReturnValueOnce(older.promise).mockResolvedValueOnce([]);
  await focus();
  await focus();
  await act(async () => older.resolve(pending));
  expect(host.textContent).not.toContain('Stock Edits (');
});

it.each([null, { id: 'branch', role: 'branch_manager' }])('does not fetch or listen without authorized GM portal access (%j)', async user => {
  const add = vi.spyOn(window, 'addEventListener');
  useAuth.mockReturnValue({ user, hasPortalAccess: () => false });
  await render();
  await focus();
  expect(api.get).not.toHaveBeenCalled();
  expect(add.mock.calls.filter(([type]) => type === 'focus')).toHaveLength(0);
});

it('cleans up on access loss and ignores responses from the former session', async () => {
  await render();
  const response = deferred();
  api.get.mockReturnValueOnce(response.promise);
  await focus();
  useAuth.mockReturnValue({ user: null, hasPortalAccess: () => false });
  await render();
  await act(async () => response.resolve(pending));
  await focus();
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(host.textContent).not.toContain('Stock Edits (');
});

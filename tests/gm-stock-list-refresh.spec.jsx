// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../client/src/lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));
vi.mock('../client/src/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../client/src/hooks/useStockRealtime', () => ({ useStockRealtime: vi.fn() }));
vi.mock('../client/src/components/BranchStockClearance', () => ({ default: () => null }));
import { StockAdjustmentsTab } from '../client/src/pages/portals/GMPortal';
import { api } from '../client/src/lib/api';
import { useAuth } from '../client/src/contexts/AuthContext';
import { useStockRealtime } from '../client/src/hooks/useStockRealtime';

let host, root, previousReact, records, count;
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent === text);
const focus = () => act(async () => window.dispatchEvent(new Event('focus')));
const render = () => act(async () => root.render(<StockAdjustmentsTab onCountChange={count} />));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const tableRows = () => host.querySelector('tbody').textContent;
const setNotes = async value => {
  await act(async () => {
    const textarea = host.querySelector('textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => {
  previousReact = globalThis.React;
  globalThis.React = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  useAuth.mockReturnValue({ user: { id: 'gm', role: 'gm' }, hasPortalAccess: portal => portal === 'gm' });
  records = ['one', 'two'].map(id => ({
    id, adj_number: `EDIT-${id}`, status: 'pending', product_name: `Product ${id}`,
    target_type: 'warehouse', field_to_adjust: 'quantity', new_value: '3',
  }));
  api.get.mockImplementation(async () => records.map(row => ({ ...row })));
  count = vi.fn();
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

it.each(['approved', 'rejected'])('refreshes an external %s decision and preserves the active filter', async status => {
  await render();
  await act(async () => button(status === 'approved' ? 'Approved' : 'Rejected').click());
  expect(tableRows()).not.toContain('EDIT-one');
  records[0].status = status;
  await focus();
  expect(tableRows()).toContain('EDIT-one');
  expect(tableRows()).not.toContain('EDIT-two');
  expect(count).toHaveBeenLastCalledWith(1);
  expect(api.get.mock.calls).toEqual([['/stock-adjustments'], ['/stock-adjustments']]);
  expect(api.patch).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
  expect(useStockRealtime).not.toHaveBeenCalled();
  await act(async () => button('All').click());
  expect(tableRows()).toContain('EDIT-two');
  expect(tableRows()).toContain(status === 'approved' ? 'Approved' : 'Rejected');
});

it.each(['approved', 'rejected'])('removes externally %s rows from the pending list', async status => {
  await render();
  records[0].status = status;
  await focus();
  expect(tableRows()).not.toContain('EDIT-one');
  expect(tableRows()).toContain('EDIT-two');
  expect(count).toHaveBeenLastCalledWith(1);
});

it('keeps a single confirmation and draft notes visible during refresh and retains server conflict checks', async () => {
  await render();
  await act(async () => button('✓ Approve').click());
  await setNotes('Check the original count');
  const textarea = host.querySelector('textarea');
  const response = deferred();
  api.get.mockReturnValueOnce(response.promise);
  await focus();
  expect(host.querySelector('textarea')).toBe(textarea);
  expect(textarea.value).toBe('Check the original count');
  expect(button('✓ Approve & Apply')).toBeTruthy();
  records[0].status = 'rejected';
  await act(async () => response.resolve(records));
  expect(host.querySelector('textarea')).toBe(textarea);
  expect(textarea.value).toBe('Check the original count');
  api.patch.mockRejectedValueOnce(new Error('Request is already rejected'));
  await act(async () => button('✓ Approve & Apply').click());
  expect(api.patch).toHaveBeenCalledExactlyOnceWith('/stock-adjustments/one/approve', {
    gm_notes: 'Check the original count',
  });
  expect(host.textContent).toContain('Request is already rejected');
  expect(host.querySelector('textarea').value).toBe('Check the original count');
});

it('keeps bulk confirmation open and submits only the refreshed pending IDs', async () => {
  await render();
  await act(async () => button('✓ Approve All (2)').click());
  records[0].status = 'approved';
  await focus();
  expect(button('Yes, Approve All')).toBeTruthy();
  expect(host.textContent).toContain('1 pending request');
  expect(api.post).not.toHaveBeenCalled();
  api.post.mockResolvedValueOnce({ success: true, applied: 1 });
  await act(async () => button('Yes, Approve All').click());
  expect(api.post).toHaveBeenCalledExactlyOnceWith('/stock-adjustments/bulk-decision', {
    action: 'approve', ids: ['two'], gm_notes: 'Bulk approve by GM',
  });
});

it('keeps rows, filter and notes when refresh fails or returns malformed data', async () => {
  await render();
  await act(async () => button('All').click());
  await act(async () => button('✓ Approve').click());
  await setNotes('Keep this draft');
  api.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ error: 'unavailable' });
  await focus();
  expect(host.textContent).toContain('Could not refresh stock edits: offline');
  await focus();
  expect(host.textContent).toContain('Invalid stock edits response');
  expect(tableRows()).toContain('EDIT-one');
  expect(host.querySelector('textarea').value).toBe('Keep this draft');
  expect(count).toHaveBeenCalledTimes(1);
  records[0].status = 'approved';
  await focus();
  expect(tableRows()).toContain('EDIT-one'); // Still viewing All, not Pending.
});

it.each(['resolve', 'reject'])('removes its focus listener and ignores late %s after unmount', async finish => {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  await render();
  const response = deferred();
  api.get.mockReturnValueOnce(response.promise);
  await focus();
  const listeners = add.mock.calls.filter(([type]) => type === 'focus');
  expect(listeners).toHaveLength(1);
  await act(async () => root.unmount());
  root = null;
  expect(remove).toHaveBeenCalledWith('focus', listeners[0][1]);
  await focus();
  await act(async () => response[finish](finish === 'resolve' ? [] : new Error('offline')));
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(count).toHaveBeenCalledTimes(1);
});

it('ignores older responses arriving after a newer refresh', async () => {
  await render();
  const older = deferred();
  api.get.mockReturnValueOnce(older.promise).mockResolvedValueOnce([]);
  await focus();
  await focus();
  await act(async () => older.resolve(records));
  expect(tableRows()).not.toContain('EDIT-one');
  expect(count).toHaveBeenLastCalledWith(0);
});

it.each([null, { id: 'branch', role: 'branch_manager' }])('does not fetch or listen without GM access (%j)', async user => {
  const add = vi.spyOn(window, 'addEventListener');
  useAuth.mockReturnValue({ user, hasPortalAccess: () => false });
  await render();
  await focus();
  expect(api.get).not.toHaveBeenCalled();
  expect(add.mock.calls.filter(([type]) => type === 'focus')).toHaveLength(0);
});

it('cleans up on access loss and ignores former-session responses', async () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  await render();
  const response = deferred();
  api.get.mockReturnValueOnce(response.promise);
  await focus();
  useAuth.mockReturnValue({ user: null, hasPortalAccess: () => false });
  await render();
  await act(async () => response.resolve(records));
  await focus();
  expect(remove.mock.calls.some(([type]) => type === 'focus')).toBe(true);
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(count).toHaveBeenCalledTimes(1);
  expect(tableRows()).not.toContain('EDIT-one');
});

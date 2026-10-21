// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../client/src/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../client/src/hooks/useStockRealtime', () => ({ useStockRealtime: vi.fn() }));
vi.mock('../client/src/components/BranchStockClearance', () => ({ default: () => null }));
import { ApprovalsTab } from '../client/src/pages/portals/GMPortal';
import { api } from '../client/src/lib/api';
import { useAuth } from '../client/src/contexts/AuthContext';
import { useStockRealtime } from '../client/src/hooks/useStockRealtime';

const queues = [
  ['cash', '/branch/cash-movements', 'movements', 'pending', 'Cash'],
  ['hrLeave', '/hr/leaves?status=pending', 'leaves', 'pending', 'Leave'],
  ['stock', '/stock-requests', 'requests', 'reviewed', 'Stock Movements'],
  ['transfer', '/stock/transfers?status=pending_approval', 'transfers', 'pending_approval', '🚚 Transfers'],
  ['field', '/field_program_requests', 'requests', 'pending', '🌿 Field Stock'],
  ['petty', '/finance/petty-cash/requests', 'requests', 'pending_gm', '💵 Petty Cash'],
  ['rent', '/finance/rent-payments/edit-requests?status=pending', 'requests', 'pending', '🏘️ Rent Edits'],
  ['salary', '/hr/salary-ledger/edit-requests?status=pending', 'requests', 'pending', '💼 Salary Edits'],
  ['cas', '/cash-requests/admin?status=finance_reviewed', null, 'finance_reviewed', '🏢 CAS Approvals'],
  ['leave', '/leave-requests/admin', null, 'Pending', '📅 Leave Approvals'],
  ['bonus', '/finance/distributor-bonuses/delete-requests?status=pending_gm', 'requests', 'pending_gm', '🗑️ Bonus Deletions'],
  ['staff', '/hr/staff-change-requests?status=pending', 'requests', 'pending', '👥 HR Staff Changes'],
  ['writeoff', '/stock-movements?type=write_off&status=pending_approval&limit=200', 'movements', 'pending_approval', '✏️ Write-Offs'],
];
let host, root, previousReact, records;
const buttons = () => [...host.querySelectorAll('button')];
const button = label => buttons().find(b => b.textContent.trim() === label);
const tab = label => buttons().find(b => b.textContent.trim().replace(/ \(\d+\)$/, '') === label);
const click = element => act(async () => {
  expect(element).toBeTruthy();
  element.click();
});
const focus = () => act(async () => window.dispatchEvent(new Event('focus')));
const render = () => act(async () => root.render(<ApprovalsTab />));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const response = path => {
  const [key, , envelope] = queues.find(([, endpoint]) => path === endpoint);
  const rows = records[key].map(r => ({ ...r }));
  return envelope ? { [envelope]: rows } : rows;
};
const edit = (element, value) => act(async () => {
  const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
});

beforeEach(() => {
  previousReact = globalThis.React;
  globalThis.React = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  useAuth.mockReturnValue({ user: { id: 'gm', username: 'GM' }, hasPortalAccess: p => p === 'gm' });
  records = Object.fromEntries(queues.map(([key, , , status]) => [key, [{
    id: `REQUEST-${key}`, request_number: `REQUEST-${key}`, status,
    branch: 'Test Branch', branch_name: 'Test Branch', name: 'Test Staff',
    full_name: 'Test Staff', staffName: 'Test Staff', request_type: 'add',
    product_name: 'Test Product', amount: 100, quantity: 2,
    from_location: 'country_stock', to_location: 'windhoek_warehouse',
    items: [{ productName: 'Test Product', quantity: 2 }], proposed_changes: { amount: 100 },
    period_label: 'Test Period', period: '2026-10', products: [],
  }]]));
  vi.spyOn(api, 'get').mockImplementation(async path => response(path));
  vi.spyOn(api, 'put').mockResolvedValue({ success: true });
  vi.spyOn(api, 'patch').mockResolvedValue({ success: true });
  vi.spyOn(api, 'post').mockResolvedValue({ success: true });
  vi.spyOn(api.stock, 'batchAvailability').mockResolvedValue({ success: true, availability: [] });
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

it.each(queues)('refreshes the %s queue after external review without changing the selected queue', async (key, path, envelope, status, label) => {
  await render();
  await click(tab(label));
  const selected = tab(label);
  const selectedClass = selected.className;
  if (['cash', 'hrLeave', 'stock', 'petty'].includes(key)) {
    expect(host.textContent).toContain(`REQUEST-${key}`);
  } else {
    expect(selected.textContent).toContain('(1)');
  }
  // The endpoint no longer includes the request after the other reviewer acts.
  records[key] = [];
  await focus();
  expect(tab(label)).toBe(selected);
  expect(selected.className).toBe(selectedClass);
  if (['cash', 'hrLeave', 'stock', 'petty'].includes(key)) {
    expect(host.textContent).not.toContain(`REQUEST-${key}`);
  } else {
    expect(selected.textContent).not.toContain('(1)');
  }
  expect(api.get.mock.calls.map(([p]) => p)).toEqual([
    ...queues.map(([, p]) => p), ...queues.map(([, p]) => p),
  ]);
  expect(api.put).not.toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
  expect(useStockRealtime).not.toHaveBeenCalled();
});

it.each(['approved', 'rejected'])('refreshes external %s field and leave history with existing status filters', async status => {
  // Leave history is currently displayed alongside remaining pending requests.
  records.leave.push({ ...records.leave[0], id: 'still-pending', staffName: 'Still Pending' });
  await render();
  records.field[0].status = status;
  records.leave[0].status = status === 'approved' ? 'Approved' : 'Rejected';
  records.cash[0].status = status;
  records.hrLeave[0].status = status;
  records.stock[0].status = status;
  records.petty[0].status = status;
  records.writeoff[0].status = status;
  await focus();
  expect(tab('All Requests').textContent).not.toContain('(');
  expect(tab('✏️ Write-Offs').textContent).not.toContain('(');
  await click(tab('🌿 Field Stock'));
  expect(host.textContent).toContain('Field Stock History');
  expect(host.textContent).toContain(status === 'approved' ? '✓ Approved' : '✕ Rejected');
  await click(tab('📅 Leave Approvals'));
  expect(tab('📅 Leave Approvals').textContent).toContain('(1)');
  expect(host.textContent).toContain(status === 'approved' ? 'Approved' : 'Rejected');
});

it.each([
  ['🚚 Transfers', '✓ Approve'],
  ['🚚 Transfers', '✏️ Amend & Approve'],
  ['✏️ Write-Offs', '✕ Reject'],
  ['🏘️ Rent Edits', 'Review'],
  ['💼 Salary Edits', 'Review'],
  ['🏢 CAS Approvals', 'Review & Approve'],
  ['📅 Leave Approvals', 'Review & Approve'],
  ['🗑️ Bonus Deletions', '🗑️ Approve Delete'],
  ['👥 HR Staff Changes', '✅ Approve Add'],
])('keeps the %s review dialog and draft during an external review (%s)', async (label, open) => {
  await render();
  await click(tab(label));
  await click(button(open));
  const textarea = host.querySelector('textarea');
  expect(textarea).toBeTruthy();
  await edit(textarea, 'Keep my review draft');
  const quantity = host.querySelector('input[type="number"]');
  if (quantity) await edit(quantity, '1');
  const pending = deferred();
  const oldGet = api.get.getMockImplementation();
  api.get.mockImplementation(path => path === queues[0][1] ? pending.promise : oldGet(path));
  await focus();
  expect(host.querySelector('textarea')).toBe(textarea);
  expect(textarea.value).toBe('Keep my review draft');
  if (quantity) {
    expect(host.querySelector('input[type="number"]')).toBe(quantity);
    expect(quantity.value).toBe('1');
  }
  for (const [key] of queues) records[key] = [];
  await act(async () => pending.resolve({ movements: [] }));
  expect(host.querySelector('textarea')).toBe(textarea);
  expect(textarea.value).toBe('Keep my review draft');
});

it('preserves failed queue snapshots and drafts while successful queues refresh', async () => {
  await render();
  await click(tab('🏘️ Rent Edits'));
  await click(button('Review'));
  await edit(host.querySelector('textarea'), 'Keep draft');
  records.transfer = [];
  const normalGet = api.get.getMockImplementation();
  api.get.mockImplementation(path => path.includes('/rent-payments/')
    ? Promise.reject(new Error('Forbidden')) : normalGet(path));
  await focus();
  expect(tab('🏘️ Rent Edits').textContent).toContain('(1)');
  expect(tab('🚚 Transfers').textContent).not.toContain('(1)');
  expect(host.textContent).toContain('Rent edits: Forbidden');
  expect(host.querySelector('textarea').value).toBe('Keep draft');
  api.get.mockImplementation(path => path.includes('/rent-payments/')
    ? Promise.resolve({ error: 'unavailable' }) : normalGet(path));
  await focus();
  expect(host.textContent).toContain('Rent edits: Invalid queue response');
  expect(tab('🏘️ Rent Edits').textContent).toContain('(1)');
  api.get.mockImplementation(normalGet);
  await focus();
  expect(host.textContent).not.toContain('Error loading approval queues');
  expect(host.querySelector('textarea').value).toBe('Keep draft');
});

it.each(['resolve', 'reject'])('ignores older queue %s after a newer focus refresh', async finish => {
  await render();
  const older = deferred();
  api.get.mockImplementationOnce(() => older.promise);
  await focus();
  records.cash = [];
  await focus();
  await act(async () => older[finish](finish === 'resolve'
    ? { movements: [{ id: 'obsolete', status: 'pending' }] } : new Error('obsolete error')));
  await click(tab('Cash'));
  expect(host.textContent).toContain('No Pending Approvals');
  expect(host.textContent).not.toContain('obsolete');
});

it('does not restore locally approved requests from in-flight reads and retains decision payloads', async () => {
  await render();
  await click(tab('🏘️ Rent Edits'));
  await click(button('Review'));
  await edit(host.querySelector('textarea'), 'Original draft');
  const older = deferred();
  api.get.mockImplementationOnce(() => older.promise);
  await focus();
  await click(button('✓ Approve & Apply'));
  expect(api.patch).toHaveBeenCalledExactlyOnceWith('/finance/rent-payments/edit-requests/REQUEST-rent', {
    action: 'approve', review_notes: 'Original draft',
  });
  await act(async () => older.resolve({ movements: [] }));
  expect(tab('🏘️ Rent Edits').textContent).not.toContain('(1)');
  expect(host.textContent).toContain('No Pending Rent Edit Requests');
});

it('defers focus refresh during a local decision and refreshes afterwards', async () => {
  await render();
  await click(tab('🏘️ Rent Edits'));
  await click(button('Review'));
  const decision = deferred();
  api.patch.mockReturnValueOnce(decision.promise);
  await click(button('✓ Approve & Apply'));
  await focus();
  expect(api.get).toHaveBeenCalledTimes(13);
  records.rent = [];
  records.transfer = [];
  await act(async () => decision.resolve({ success: true }));
  expect(api.get).toHaveBeenCalledTimes(26);
  expect(tab('🚚 Transfers').textContent).not.toContain('(1)');
  expect(tab('🏘️ Rent Edits').textContent).not.toContain('(1)');
});

it('keeps server conflict handling and notes when an externally handled request is submitted', async () => {
  await render();
  await click(tab('🏘️ Rent Edits'));
  await click(button('Review'));
  await edit(host.querySelector('textarea'), 'My pending draft');
  records.rent = [];
  await focus();
  api.patch.mockRejectedValueOnce(new Error('Request already reviewed'));
  await click(button('✓ Approve & Apply'));
  expect(host.textContent).toContain('Request already reviewed');
  expect(host.querySelector('textarea').value).toBe('My pending draft');
});

it.each(['resolve', 'reject'])('removes listeners and ignores late %s on unmount', async finish => {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  await render();
  const pending = deferred();
  api.get.mockImplementationOnce(() => pending.promise);
  await focus();
  const listeners = add.mock.calls.filter(([type]) => type === 'focus');
  expect(listeners).toHaveLength(1);
  await act(async () => root.unmount());
  root = null;
  expect(remove).toHaveBeenCalledWith('focus', listeners[0][1]);
  await act(async () => pending[finish](finish === 'resolve' ? { movements: [] } : new Error('late error')));
  await focus();
  expect(api.get).toHaveBeenCalledTimes(26);
});

it.each([null, { id: 'branch', role: 'branch_manager' }])('does not read queues or attach listeners without GM access (%j)', async user => {
  const add = vi.spyOn(window, 'addEventListener');
  useAuth.mockReturnValue({ user, hasPortalAccess: () => false });
  await render();
  await focus();
  expect(api.get).not.toHaveBeenCalled();
  expect(add.mock.calls.filter(([type]) => type === 'focus')).toHaveLength(0);
});

it('ignores responses and removes its listener when access is lost', async () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  await render();
  const pending = deferred();
  api.get.mockImplementationOnce(() => pending.promise);
  await focus();
  useAuth.mockReturnValue({ user: null, hasPortalAccess: () => false });
  await render();
  await act(async () => pending.resolve({ movements: [{ id: 'old-session', status: 'pending' }] }));
  await focus();
  expect(remove.mock.calls.some(([type]) => type === 'focus')).toBe(true);
  expect(api.get).toHaveBeenCalledTimes(26);
  expect(tab('All Requests').textContent).not.toContain('(');
  expect(host.textContent).not.toContain('old-session');
});

// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import OffSystemPending from './OffSystemPending.jsx';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../lib/api', () => ({ api: mocks }));
const form = {
  id: 'encounter-118', client_id: 'client-119', client_name: 'Ester Amutenya', branch: 'okongo', source: 'paper', version: 3,
  service_at: '2024-02-11T10:00:00Z', pricingLabel: 'Member price',
  data: { originalAuthor: 'Recorded prescriber', originalFormReference: 'PAPER-118', medicines: [] },
  quantities: [
    { name: 'Recorded tablet', unit: 'tablet', quantity: 8, alreadyDispensed: 3, liveDispensed: 1, dispensed: 4, outstanding: 4, unitPrice: 12.75 },
    { name: 'Manual medicine', unit: 'pack', quantity: 2, alreadyDispensed: 0, liveDispensed: 0, outstanding: 2, unitPrice: null, issueError: 'Medicine is missing from catalogue' },
  ],
};
let host, root;
const originalReact = globalThis.React;
beforeAll(() => { globalThis.React = React; globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { globalThis.React = originalReact; globalThis.IS_REACT_ACT_ENVIRONMENT = false; });
beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks();
  mocks.get.mockResolvedValue({ forms: [form] });
  mocks.post.mockResolvedValue({ success: true, receipt: { reference: 'ISSUE-118', total: 25.50, paymentMethod: 'cash', items: [{ name: 'Recorded tablet', quantity: 2 }] }, encounter: form });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const render = (role = 'dispenser', branch = 'okongo') => act(async () => root.render(<OffSystemPending key={branch} branch={branch} userRole={role} />));
const button = text => [...host.querySelectorAll('button')].find(item => item.textContent.trim() === text);
const click = text => act(async () => button(text).click());
const selectForm = () => act(async () => host.querySelector('.op-form').click());
const fill = (input, value) => act(async () => {
  const prototype = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const prepare = async () => {
  await render(); await selectForm();
  await fill(host.querySelector('input[aria-label="Issue quantity for Recorded tablet"]'), '2');
  for (const input of host.querySelectorAll('input[type=checkbox]')) await act(async () => input.click());
};

describe('off-system branch issues', () => {
  it('uses the assigned branch, searches reference and client, and displays split counts', async () => {
    await render('dispenser', 'branch-with-space');
    expect(mocks.get).toHaveBeenCalledWith('/branch/off-system-pending?branch=branch-with-space');
    expect(host.textContent).toContain('Historical issued 3');
    expect(host.textContent).toContain('New issued 1');
    expect(host.textContent).toContain('Pending 6');
    await fill(host.querySelector('input[type=search]'), 'no such client');
    expect(host.textContent).toContain('No matching forms');
    await fill(host.querySelector('input[type=search]'), 'ESTER');
    expect(host.querySelectorAll('.op-form')).toHaveLength(1);
    await fill(host.querySelector('input[type=search]'), 'PAPER-118');
    expect(host.querySelectorAll('.op-form')).toHaveLength(1);
  });
  it('requires explicit whole pending quantities and both confirmations; no pack conversion or stock calls', async () => {
    await render(); await selectForm();
    const input = host.querySelector('input[aria-label="Issue quantity for Recorded tablet"]');
    expect(input.value).toBe('0');
    expect(host.querySelector('input[aria-label="Issue quantity for Manual medicine"]').disabled).toBe(true);
    expect(host.textContent).toContain('Medicine is missing from catalogue');
    await fill(input, '99'); expect(input.value).toBe('4');
    await fill(input, '1.5');
    for (const checkbox of host.querySelectorAll('input[type=checkbox]')) await act(async () => checkbox.click());
    expect(button('Record payment and issue').disabled).toBe(true);
    await fill(input, '2');
    expect(button('Record payment and issue').disabled).toBe(true);
    expect(host.textContent).toContain('Charge now: N$ 25.50');
    for (const checkbox of host.querySelectorAll('input[type=checkbox]')) await act(async () => checkbox.click());
    await fill(host.querySelector('select'), 'eft');
    expect(button('Record payment and issue').disabled).toBe(true);
    await act(async () => host.querySelector('input[type=checkbox]').click());
    await click('Record payment and issue');
    expect(mocks.post).toHaveBeenCalledWith('/branch/off-system-pending', {
      operationId: expect.any(String), encounterId: form.id, version: 3,
      items: [{ name: 'Recorded tablet', quantity: 2 }], paymentMethod: 'eft', paymentConfirmed: true, physicalConfirmed: true, expectedTotal: 25.50,
    });
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Issue completed · ISSUE-118');
    expect(button('Print receipt')).toBeDefined();
  });
  it('preserves the exact request and stable operation ID after an uncertain outcome, including remount', async () => {
    mocks.post.mockRejectedValueOnce(new Error('Network result unconfirmed'));
    await prepare(); await click('Record payment and issue');
    const original = mocks.post.mock.calls[0][1];
    expect(host.querySelector('input[type=number]').disabled).toBe(true);
    expect(button('Reload references').disabled).toBe(true);
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    expect(host.textContent).toContain('awaiting confirmation');
    await click('Retry exact request');
    expect(mocks.post.mock.calls[1][1]).toEqual(original);
    expect(sessionStorage.getItem('off-system-issue:okongo')).toBeNull();
  });
  it.each(['Record version changed; reload', 'Price changed; reload'])('blocks %s and requires fresh review after reload', async message => {
    mocks.post.mockRejectedValueOnce(Object.assign(new Error(message), { status: 409 }));
    await prepare(); await click('Record payment and issue');
    expect(button('Retry exact request')).toBeUndefined();
    expect(button('Record payment and issue').matches(':disabled')).toBe(true);
    await click('Reload references');
    expect(host.querySelector('input[type=number]')).toBeNull();
    await selectForm();
    expect(host.querySelector('input[type=number]').value).toBe('0');
  });
  it.each(['frontdesk', 'consultant'])('keeps %s read-only with no payment controls', async role => {
    await render(role); await selectForm();
    expect(host.textContent).toContain('Read-only references');
    expect(host.querySelector('input[type=number]')).toBeNull();
    expect(button('Record payment and issue')).toBeUndefined();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('shows a rejected stock error without creating frontend stock mutations', async () => {
    mocks.post.mockRejectedValueOnce(Object.assign(new Error('Insufficient branch stock'), { status: 422 }));
    await prepare(); await click('Record payment and issue');
    expect(host.textContent).toContain('Insufficient branch stock');
    expect(button('Retry exact request')).toBeUndefined();
    expect(host.querySelector('input[type=number]').disabled).toBe(false);
    expect(mocks.post.mock.calls.map(([endpoint]) => endpoint)).toEqual(['/branch/off-system-pending']);
  });
  it('locks issue while a request is in flight and never submits a second operation', async () => {
    let resolve;
    mocks.post.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await prepare(); await click('Record payment and issue');
    expect(button('Confirming issue…').matches(':disabled')).toBe(true);
    expect(button('Retry exact request').disabled).toBe(true);
    await act(async () => button('Confirming issue…').click());
    expect(mocks.post).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ success: true, receipt: { reference: 'ISSUE-118', total: 25.50, paymentMethod: 'cash', items: [] } }));
    expect(host.textContent).toContain('Issue completed');
  });
  it('shows loading, error/retry and an empty branch list', async () => {
    let reject;
    mocks.get.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    await render();
    expect(host.querySelector('[aria-busy=true]')).not.toBeNull();
    await act(async () => reject(new Error('References unavailable')));
    expect(host.textContent).toContain('References unavailable');
    mocks.get.mockResolvedValue({ forms: [] });
    await click('Retry loading references');
    expect(host.textContent).toContain('No off-system forms for this branch');
  });
});

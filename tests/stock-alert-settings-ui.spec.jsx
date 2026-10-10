// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import StockAlertSettings from '../client/src/components/StockAlertSettings.jsx';
import StockAlertPolicyProvider, { useStockAlertPolicy } from '../client/src/components/StockAlertPolicyProvider.jsx';
import { api } from '../client/src/lib/api.js';
vi.mock('../client/src/lib/api.js', () => ({ api: { get: vi.fn(), put: vi.fn() } }));
let container, root;
const defaults = { lowStockThreshold: 10, expiryWarningDays: 90 };
beforeEach(() => {
  globalThis.React = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete globalThis.React; });
async function change(index, value) {
  const input = container.querySelectorAll('input')[index];
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}
it('saves confirmed numeric values, updates the parent policy, and keeps the success message visible', async () => {
  function Parent() {
    const [policy, setPolicy] = useState(defaults);
    return <><output>{JSON.stringify(policy)}</output><StockAlertSettings policy={policy} canEdit onSaved={setPolicy} /></>;
  }
  await act(async () => root.render(<Parent />));
  await change(0, '25'); await change(1, '0');
  api.put.mockResolvedValue({ success: true, policy: { lowStockThreshold: 25, expiryWarningDays: 0 } });
  await submit();
  expect(api.put).toHaveBeenCalledWith('/stock/alert-policy', { lowStockThreshold: 25, expiryWarningDays: 0 });
  expect(container.querySelector('output').textContent).toContain('"lowStockThreshold":25');
  expect(container.textContent).toContain('saved and confirmed');
});
it('shows a failed save without updating the policy and rejects blank or fractional quantities', async () => {
  const onSaved = vi.fn();
  await act(async () => root.render(<StockAlertSettings policy={defaults} canEdit onSaved={onSaved} />));
  await change(0, ''); await submit();
  expect(api.put).not.toHaveBeenCalled();
  await change(0, '1.5'); await submit();
  expect(api.put).not.toHaveBeenCalled();
  await change(0, '20');
  api.put.mockRejectedValue(new Error('Access denied'));
  await submit();
  expect(container.textContent).toContain('Settings were not saved.');
  expect(onSaved).not.toHaveBeenCalled();
});
it('renders read-only settings without a save control', async () => {
  await act(async () => root.render(<StockAlertSettings policy={defaults} canEdit={false} />));
  expect([...container.querySelectorAll('input')].every(input => input.disabled)).toBe(true);
  expect(container.textContent).not.toContain('Save alert policy');
  await submit();
  expect(api.put).not.toHaveBeenCalled();
});
it('does not render warning views with guessed defaults when loading fails', async () => {
  function Child() { const { lowStockThreshold } = useStockAlertPolicy(); return <output>{lowStockThreshold}</output>; }
  api.get.mockRejectedValue(new Error('Policy unavailable'));
  await act(async () => root.render(<StockAlertPolicyProvider><Child /></StockAlertPolicyProvider>));
  expect(container.querySelector('output')).toBeNull();
  expect(container.textContent).toContain('could not be loaded');
  api.get.mockResolvedValue({ policy: { lowStockThreshold: 25, expiryWarningDays: 40 }, canEdit: true });
  await act(async () => container.querySelector('button').click());
  expect(container.querySelector('output').textContent).toBe('25');
});

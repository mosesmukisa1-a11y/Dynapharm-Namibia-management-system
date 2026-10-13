// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import MedicineSelection from './MedicineSelection';
import HistoryMedicineSelection from './HistoryMedicineSelection';

const mocks = vi.hoisted(() => ({ prices: vi.fn() }));
vi.mock('../lib/api', () => ({ api: { prices: { list: mocks.prices } } }));
const previousReact = globalThis.React;
let host, root;
beforeAll(() => { globalThis.React = React; globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { globalThis.React = previousReact; globalThis.IS_REACT_ACT_ENVIRONMENT = false; });
beforeEach(() => {
  mocks.prices.mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const render = element => act(async () => root.render(element));
describe('shared Consultant medicine selection presentation', () => {
  it('retains package precedence, original catalogue ordering, price values, stock warnings and exact callback names', async () => {
    const toggle = vi.fn();
    await render(<MedicineSelection products={[
      { description: 'Tablet Z', dp: 24.7, cp: 32.4, bv: 4 },
      { description: 'Bundle B', is_package: true, dp: 210.5, cp: 275.8, bv: 17 },
      { description: 'Tablet A', dp: 41.2, cp: 57.3, bv: 6 },
      { description: 'Tablet Z', dp: 99 },
      { description: 'Bundle B', is_package: false, dp: 888 },
    ]} medSearch="" setMedSearch={vi.fn()} selectedMedicines={new Set(['Tablet Z'])} toggleMedicine={toggle}
      stockLoaded branchInStock={new Set(['tablet z'])} />);
    expect([...host.querySelectorAll('input[type=checkbox]')].map(input => input.getAttribute('aria-label')))
      .toEqual(['Bundle B', 'Tablet Z', 'Tablet A']);
    expect(host.textContent).toContain('DP: N$24.7 · CP: N$32.4 · BV: 4');
    expect(host.textContent).toContain('DP: N$210.5 · CP: N$275.8 · BV: 17');
    expect(host.textContent).not.toContain('888');
    expect(host.textContent.match(/OUT OF STOCK/g)).toHaveLength(2);
    await act(async () => host.querySelector('input[type=checkbox]').click());
    expect(toggle.mock.calls).toEqual([['Bundle B']]);
    await act(async () => host.querySelector('.medicine-selection-card').click());
    expect(toggle.mock.calls[1]).toEqual(['Bundle B']);
    await act(async () => host.querySelector('button').click());
    expect(toggle.mock.calls[2]).toEqual(['Tablet Z']);
  });
  it('locks row, checkbox and chip actions during an unconfirmed history request', async () => {
    const toggle = vi.fn();
    await render(<MedicineSelection products={[{ description: 'Recorded tablet' }]} medSearch="" setMedSearch={vi.fn()}
      selectedMedicines={new Set(['Recorded tablet'])} toggleMedicine={toggle} historical disabled />);
    await act(async () => host.querySelector('.medicine-selection-card').click());
    await act(async () => host.querySelector('button').click());
    expect(toggle).not.toHaveBeenCalled();
    expect(host.querySelector('input[type=checkbox]').disabled).toBe(true);
  });
  it('reports malformed live catalogue responses and an empty catalogue without invented products', async () => {
    mocks.prices.mockResolvedValueOnce({ products: [] }).mockResolvedValueOnce([]);
    await render(<HistoryMedicineSelection medicines={[]} onToggle={vi.fn()} />);
    expect(host.textContent).toContain('invalid response');
    expect(host.querySelectorAll('input[type=checkbox]')).toHaveLength(0);
    await act(async () => host.querySelector('button').click());
    expect(host.textContent).toContain('current catalogue is empty');
    expect(host.querySelectorAll('input[type=checkbox]')).toHaveLength(0);
  });
});

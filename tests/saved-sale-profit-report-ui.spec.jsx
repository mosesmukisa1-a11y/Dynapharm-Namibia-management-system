// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../client/src/lib/api', () => ({
  api: { director: { profitAnalysis: vi.fn() }, prices: { list: vi.fn() } },
}));
vi.mock('../client/src/lib/pricing', () => ({
  getLiveProductList: vi.fn(), setLivePrices: vi.fn(),
}));
import { api } from '../client/src/lib/api';
import { getLiveProductList, setLivePrices } from '../client/src/lib/pricing';
import { formatCurrency } from '../client/src/lib/constants';
import { namibiaDay } from '../client/src/lib/saleEvidence.js';
import SavedSaleProfitReport from '../client/src/components/SavedSaleProfitReport';

const product = {
  productName: 'Saved evidence fixture', qtySold: 1,
  revenueDp: 341, chargedTotal: 443, commercialMargin: 102,
  cifCost: 70, actualProfit: 373,
  missingDpQuantity: 0, missingChargedQuantity: 0, missingCostQuantity: 0,
};
let host, root, previousReact;
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent === text);
const rowCells = () => [...host.querySelectorAll('tbody tr:first-child td')].map(c => c.textContent);
const money = value => formatCurrency(value);
async function change(input, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
beforeEach(() => {
  previousReact = globalThis.React;
  globalThis.React = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetAllMocks();
  api.director.profitAnalysis.mockResolvedValue({ products: [{ ...product }] });
  api.prices.list.mockResolvedValue([{ description: product.productName, dp: 999, cp: 1200, cif: 500 }]);
  getLiveProductList.mockReturnValue([{ description: product.productName, dp: 999, cp: 1200, cif: 500 }]);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  globalThis.React = previousReact;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

it('both portals import the focused report without a cross-portal profit implementation', () => {
  for (const portal of ['GMPortal', 'DirectorPortal']) {
    const source = readFileSync(`client/src/pages/portals/${portal}.jsx`, 'utf8');
    expect(source).toContain("import SavedSaleProfitReport from '../../components/SavedSaleProfitReport'");
    expect(source).toContain('<SavedSaleProfitReport');
    expect(source).not.toContain('function ProfitAnalysisTab');
  }
  expect(readFileSync('client/src/pages/portals/DirectorPortal.jsx', 'utf8')).not.toContain("from './GMPortal'");
});

it('keeps 341 DP, 443 charged, 102 commercial margin and original CIF70/profit373 through scenario edits and reset', async () => {
  await act(async () => root.render(<SavedSaleProfitReport />));
  const expected = [
    product.productName, money(70), money(341), money(443), money(102),
    '-', money(373), '84.2%', '1', money(373), 'Set Campaign',
  ];
  expect(rowCells()).toEqual(expected);
  expect(host.textContent).toContain(`Saved DP (known): ${money(341)}`);
  expect(host.textContent).toContain(`Customer receipts (known): ${money(443)}`);
  expect(setLivePrices).toHaveBeenCalled();

  await act(async () => button('Set Campaign').click());
  await change(host.querySelector('input[type=number]'), '800');
  await act(async () => button('Apply Campaign Price').click());
  expect(rowCells()).toEqual(expected.map((v, i) => i === 5 ? money(800) : v));
  // Scenario updates are local only: no sale, price or report write is submitted.
  expect(api.director.profitAnalysis).toHaveBeenCalledTimes(1);
  expect(api.prices.list).toHaveBeenCalledTimes(1);
  await act(async () => button('Set Campaign').click());
  await act(async () => button('Reset to DP').click());
  expect(rowCells()).toEqual(expected);
});

it('preserves Namibia date defaults, date filtering and Apply reload', async () => {
  await act(async () => root.render(<SavedSaleProfitReport />));
  const today = namibiaDay();
  expect(api.director.profitAnalysis).toHaveBeenLastCalledWith({
    startDate: today.slice(0, 8) + '01', endDate: today,
  });
  await change(host.querySelectorAll('input[type=date]')[0], '2026-01-02');
  await change(host.querySelectorAll('input[type=date]')[1], '2026-01-31');
  expect(api.director.profitAnalysis).toHaveBeenLastCalledWith({
    startDate: '2026-01-02', endDate: '2026-01-31',
  });
  const count = api.director.profitAnalysis.mock.calls.length;
  await act(async () => button('Apply').click());
  expect(api.director.profitAnalysis).toHaveBeenCalledTimes(count + 1);
});

it('retains explicit incomplete evidence and does not substitute current catalogue values', async () => {
  api.director.profitAnalysis.mockResolvedValue({ products: [{
    ...product, revenueDp: 0, cifCost: 0, actualProfit: null, commercialMargin: null,
    missingDpQuantity: 1, missingCostQuantity: 1,
  }] });
  await act(async () => root.render(<SavedSaleProfitReport />));
  expect(rowCells().slice(1, 7)).toEqual(['Incomplete', 'Incomplete', money(443), 'Incomplete', '-', 'Incomplete']);
  expect(host.textContent).toContain('Incomplete original evidence');
});

it('retains captured zero values instead of filling them from the catalogue', async () => {
  api.director.profitAnalysis.mockResolvedValue({ products: [{
    ...product, revenueDp: 0, chargedTotal: 0, commercialMargin: 0, cifCost: 0, actualProfit: 0,
  }] });
  await act(async () => root.render(<SavedSaleProfitReport />));
  expect(rowCells().slice(1, 7)).toEqual([money(0), money(0), money(0), money(0), '-', money(0)]);
  expect(host.textContent).not.toContain('Incomplete original evidence');
});

it('shows a loading state and an explicit report failure', async () => {
  let reject;
  api.director.profitAnalysis.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  await act(async () => root.render(<SavedSaleProfitReport />));
  expect(host.querySelector('tbody')).toBeNull();
  await act(async () => reject(new Error('Evidence unavailable')));
  expect(host.querySelector('[role=alert]').textContent).toBe('Unable to load saved sale evidence: Evidence unavailable');
});

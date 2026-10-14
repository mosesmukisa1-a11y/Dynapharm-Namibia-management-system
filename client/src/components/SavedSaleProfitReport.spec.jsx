// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import SavedSaleProfitReport from './SavedSaleProfitReport.jsx';

const mocks = vi.hoisted(() => ({
  profitAnalysis: vi.fn(),
  prices: vi.fn(),
  setLivePrices: vi.fn(),
}));

vi.mock('../lib/api', () => ({ api: {
  director: { profitAnalysis: mocks.profitAnalysis },
  prices: { list: mocks.prices },
} }));
vi.mock('../lib/pricing', () => ({
  getLiveProductList: () => [],
  setLivePrices: mocks.setLivePrices,
}));
vi.mock('../lib/constants', () => ({ formatCurrency: value => `N$${value}` }));
vi.mock('./ui', () => ({
  Card: ({ children }) => <section>{children}</section>,
  CardBody: ({ children }) => <div>{children}</div>,
  CardHeader: ({ children }) => <header>{children}</header>,
  Button: ({ children, onClick }) => <button onClick={onClick}>{children}</button>,
  Input: props => <input {...props} />,
  Badge: ({ children }) => <span>{children}</span>,
  LoadingSpinner: () => <p>Loading report</p>,
  StatCard: ({ title, value }) => <div>{title}: {value}</div>,
  Modal: () => null,
}));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const product = productName => ({
  productName, qtySold: 1, revenueDp: 10, chargedTotal: 12, cifCost: 3,
  actualProfit: 9, commercialMargin: 2, missingDpQuantity: false,
  missingChargedQuantity: false, missingCostQuantity: false,
});

const originalReact = globalThis.React;
let host;
let root;
beforeAll(() => { globalThis.React = React; globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { globalThis.React = originalReact; globalThis.IS_REACT_ACT_ENVIRONMENT = false; });
beforeEach(() => {
  mocks.profitAnalysis.mockReset();
  mocks.prices.mockReset().mockResolvedValue([]);
  mocks.setLivePrices.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const render = () => act(async () => root.render(<SavedSaleProfitReport />));
const setDate = async (label, value) => {
  const input = [...host.querySelectorAll('input[type="date"]')]
    .find(node => node.parentElement.textContent.trim() === label);
  expect(input).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

describe('saved-sale profit report request ordering', () => {
  it('keeps the latest selected period when an older response arrives last', async () => {
    const pending = [];
    mocks.profitAnalysis.mockImplementation(params => {
      const request = deferred();
      pending.push({ params, ...request });
      return request.promise;
    });

    await render();
    expect(pending).toHaveLength(1);

    await setDate('From', '2026-10-05');
    await setDate('To', '2026-10-10');
    expect(pending).toHaveLength(3);
    expect(pending[2].params).toEqual({ startDate: '2026-10-05', endDate: '2026-10-10' });

    await act(async () => {
      pending[2].resolve({ products: [product('Selected period product')] });
      await pending[2].promise;
    });
    expect(host.textContent).toContain('Selected period product');
    expect(host.textContent).not.toContain('Older period product');
    expect(host.textContent).not.toContain('Loading report');

    await act(async () => {
      pending[0].resolve({ products: [product('Older period product')] });
      pending[1].resolve({ products: [product('Intermediate period product')] });
      await Promise.all([pending[0].promise, pending[1].promise]);
    });
    expect(host.textContent).toContain('Selected period product');
    expect(host.textContent).not.toContain('Older period product');
    expect(host.textContent).not.toContain('Intermediate period product');
  });
  it('ignores an older failure and keeps loading until the selected request finishes', async () => {
    const oldRequest = deferred();
    const selectedRequest = deferred();
    mocks.profitAnalysis.mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(selectedRequest.promise);
    await render();
    await setDate('From', '2026-10-05');
    await act(async () => {
      oldRequest.reject(new Error('Old period failure'));
      await oldRequest.promise.catch(() => {});
    });
    expect(host.textContent).not.toContain('Old period failure');
    expect(host.textContent).toContain('Loading report');
    await act(async () => {
      selectedRequest.resolve({ products: [product('Selected period product')] });
      await selectedRequest.promise;
    });
    expect(host.textContent).toContain('Selected period product');
    expect(host.textContent).not.toContain('Loading report');
  });
});

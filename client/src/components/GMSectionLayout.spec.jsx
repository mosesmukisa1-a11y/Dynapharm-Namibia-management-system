import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GMSectionLayout from './GMSectionLayout';

const labels = [
  'Dashboard', 'Approvals', 'Stock Edits (7)', 'Price List', 'Price Advisor',
  'Campaigns', 'Profit Analysis', 'Current Stock', 'Original Costs & Profit',
  'Controlled Counts & Returns', 'Historical Refund Evidence', 'Accounts',
  'Bonus History', 'Statements', 'Communication', 'Staff Services', 'My Messages',
  'Distributor Performance', 'Discrepancy Inbox', 'Check-ups',
];
const tabs = labels.map((label, index) => ({ id: `section-${index}`, label, icon: '•' }));
let host, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('React', React);
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
const desktop = () => host.querySelector('aside nav');
const trigger = () => host.querySelector('[aria-expanded]');

it('exposes all twenty sections, long labels, pending counts and active state as native buttons', async () => {
  const onChange = vi.fn();
  await act(async () => root.render(
    <GMSectionLayout tabs={tabs} active="section-2" onChange={onChange} />,
  ));
  const buttons = [...desktop().querySelectorAll('button')];
  expect(buttons.map(button => button.textContent.replace('•', ''))).toEqual(labels);
  expect(buttons[2].getAttribute('aria-current')).toBe('page');
  expect(buttons.filter(button => button.hasAttribute('aria-current'))).toHaveLength(1);
  expect(buttons[2].className).toContain('text-white');
  expect(buttons[2].className).toContain('bg-red-800');
  expect(buttons[9].querySelector('span:last-child').className).toContain('whitespace-normal');
  expect(desktop().className).toContain('overflow-y-auto');
  expect(host.querySelector('[data-gm-section-content]').className).toContain('overflow-x-auto');
  for (let index = 0; index < buttons.length; index += 1) {
    expect(buttons[index].tabIndex).toBe(0);
    await act(async () => buttons[index].click());
    expect(onChange).toHaveBeenLastCalledWith(tabs[index].id);
  }
});

it('retains active-section revisit and independent refresh callbacks', async () => {
  const onChange = vi.fn(), onRefresh = vi.fn();
  await act(async () => root.render(
    <GMSectionLayout tabs={tabs} active="section-13" onChange={onChange} onRefresh={onRefresh} />,
  ));
  await act(async () => desktop().querySelectorAll('button')[13].click());
  expect(onChange).toHaveBeenCalledExactlyOnceWith('section-13');
  await act(async () => host.querySelector('[aria-label="Refresh Statements"]').click());
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledTimes(1);
});

it('opens the mobile vertical menu, selects Statements, closes and focuses its heading', async () => {
  function Probe() {
    const [active, setActive] = useState('section-0');
    return <GMSectionLayout tabs={tabs} active={active} onChange={setActive}><p>Safe fixture</p></GMSectionLayout>;
  }
  await act(async () => root.render(<Probe />));
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  await act(async () => trigger().click());
  const nav = document.getElementById(trigger().getAttribute('aria-controls'));
  expect(nav.getAttribute('aria-label')).toBe('GM section navigation');
  expect(nav.querySelectorAll('button')).toHaveLength(20);
  expect(nav.style.display).toBe('grid');
  expect(nav.style.whiteSpace).toBe('normal');
  expect(nav.style.overflowX).toBe('hidden');
  await act(async () => nav.querySelectorAll('button')[13].click());
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(document.getElementById(trigger().getAttribute('aria-controls'))).toBeNull();
  expect(host.querySelector('h2').textContent).toBe('Statements');
  expect(document.activeElement).toBe(host.querySelector('h2'));
});

it('closes the mobile menu with Escape, restores trigger focus and removes its listener', async () => {
  await act(async () => root.render(<GMSectionLayout tabs={tabs} active="section-0" />));
  await act(async () => trigger().click());
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger());
  const remove = vi.spyOn(document, 'removeEventListener');
  await act(async () => trigger().click());
  await act(async () => root.render(null));
  expect(remove.mock.calls.some(([type]) => type === 'keydown')).toBe(true);
  remove.mockRestore();
});

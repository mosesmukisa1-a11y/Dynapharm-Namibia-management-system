// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('../client/src/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock('../client/src/contexts/AuthContext', () => ({
  useAuth: () => authorizedGM,
}));
vi.mock('../client/src/components/BranchStockClearance', () => ({ default: () => null }));
import { api } from '../client/src/lib/api';
import { StockAdjustmentsTab } from '../client/src/pages/portals/GMPortal';

let host, root, previousReact;
const authorizedGM = { user: { id: 'gm', role: 'gm' }, hasPortalAccess: portal => portal === 'gm' };
const pending = Array.from({ length: 16 }, (_, i) => ({
  id: `BULK-${i}`, adj_number: `BULK-${i}`, status: 'pending',
  target_type: 'warehouse', field_to_adjust: 'quantity', new_value: '0',
}));
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text));
beforeEach(() => {
  previousReact = globalThis.React; globalThis.React = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockReset(); api.post.mockReset(); api.patch.mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  globalThis.React = previousReact; delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
it('confirms and sends every pending ID once, not only the first row', async () => {
  api.get.mockResolvedValueOnce([...pending, { id: 'OLD', status: 'approved' }])
    .mockResolvedValueOnce(pending.map(r => ({ ...r, status: 'approved' })));
  api.post.mockResolvedValue({ success: true, applied: 16 });
  const count = vi.fn();
  await act(async () => root.render(<StockAdjustmentsTab onCountChange={count} />));
  await act(async () => button('Approve All (16)').click());
  expect(api.post).not.toHaveBeenCalled();
  await act(async () => button('Yes, Approve All').click());
  expect(api.post).toHaveBeenCalledExactlyOnceWith('/stock-adjustments/bulk-decision', {
    action: 'approve', ids: pending.map(r => r.id), gm_notes: 'Bulk approve by GM',
  });
  expect(api.patch).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Approved all 16 stock edit requests successfully.');
  expect(count).toHaveBeenLastCalledWith(0);
});
it('shows the failed request and keeps the full pending list on atomic rollback', async () => {
  api.get.mockResolvedValue(pending);
  api.post.mockRejectedValue(new Error('No stock edits were approved. Request BULK-8: Target stock batch not found.'));
  await act(async () => root.render(<StockAdjustmentsTab />));
  await act(async () => button('Approve All (16)').click());
  await act(async () => button('Yes, Approve All').click());
  expect(host.textContent).toContain('Request BULK-8: Target stock batch not found.');
  expect(button('Approve All (16)')).toBeTruthy();
  expect(host.textContent).not.toContain('successfully.');
});
it('rejects the full pending set and displays refresh failures rather than an empty queue', async () => {
  api.get.mockResolvedValueOnce(pending).mockRejectedValueOnce(new Error('Connection lost'));
  api.post.mockResolvedValue({ success: true, applied: 16 });
  await act(async () => root.render(<StockAdjustmentsTab />));
  await act(async () => button('Reject All').click());
  await act(async () => button('Yes, Reject All').click());
  expect(api.post.mock.calls[0][1]).toEqual({
    action: 'reject', ids: pending.map(r => r.id), gm_notes: 'Bulk reject by GM',
  });
  expect(host.textContent).toContain('Could not refresh stock edits: Connection lost');
  expect(button('Approve All (16)')).toBeTruthy();
});

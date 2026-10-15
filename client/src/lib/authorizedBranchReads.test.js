import { it, expect, vi } from 'vitest';
import { readAuthorizedBranches, BRANCH_DASHBOARD_READS, GM_BRANCH_SECTIONS, FINANCE_BRANCH_SECTIONS } from './authorizedBranchReads';
const branches = [{ id: 'townshop', name: 'Windhoek CBD' }, { id: 'swakopmund', name: 'Swakopmund' }];
it.each([['GM', GM_BRANCH_SECTIONS], ['Finance', FINANCE_BRANCH_SECTIONS]])('%s reads each branch once per section with exact parameter contracts', async (_name, sections) => {
  const read = vi.fn(async () => ({ sales: [], deposits: [], expenses: [] }));
  for (const section of sections) {
    await readAuthorizedBranches(branches, BRANCH_DASHBOARD_READS[section], { from: '2026-10-01', to: '2026-10-15' }, read);
  }
  expect(read).toHaveBeenCalledTimes(branches.length * sections.length);
  for (const section of sections) for (const branch of branches) {
    const spec = BRANCH_DASHBOARD_READS[section];
    const calls = read.mock.calls.filter(([url]) => url.startsWith(spec.endpoint + '?') &&
      new URLSearchParams(url.split('?')[1]).get(spec.branchParam) === branch.id);
    expect(calls).toHaveLength(1);
    expect(new URLSearchParams(calls[0][0].split('?')[1]).get('from')).toBe('2026-10-01');
    expect(new URLSearchParams(calls[0][0].split('?')[1]).get(spec.branchParam === 'branch' ? 'branch_id' : 'branch')).toBeNull();
  }
});
it('deduplicates persisted identities only and retains independent equal-value and unidentified rows', async () => {
  const read = vi.fn(async url => ({ sales: url.includes('townshop') ?
    [{ id: 'SAME', amount: 9 }, { id: 'ONE', amount: 9 }, { amount: 9 }] :
    [{ id: 'SAME', amount: 9 }, { id: 'TWO', amount: 9 }, { amount: 9 }] }));
  const result = await readAuthorizedBranches(branches, BRANCH_DASHBOARD_READS.sales, {}, read);
  expect(result.failures).toEqual([]);
  expect(result.rows).toHaveLength(5);
  expect(result.rows.reduce((sum, row) => sum + row.amount, 0)).toBe(45);
});
it.each(['sales', 'deposits', 'expenses'])('retains known %s rows and identifies unavailable branches instead of false zero', async section => {
  const read = async url => {
    if (url.includes('swakopmund')) throw Object.assign(Error('Unavailable'), { status: 503 });
    return { [section]: [{ id: 'KNOWN', amount: 12 }] };
  };
  const result = await readAuthorizedBranches(branches, BRANCH_DASHBOARD_READS[section], {}, read);
  expect(result.rows).toEqual([{ id: 'KNOWN', amount: 12 }]);
  expect(result.failures).toEqual([{ branchId: 'swakopmund', branchName: 'Swakopmund', status: 503, message: 'Unavailable' }]);
});
it('rejects malformed successful payloads instead of accepting an empty complete total', async () => {
  const result = await readAuthorizedBranches(branches, BRANCH_DASHBOARD_READS.sales, {}, async () => ({}));
  expect(result.failures).toHaveLength(2);
});

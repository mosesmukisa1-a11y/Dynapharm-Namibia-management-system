import { api } from './api';

const spec = (endpoint, branchParam, key) => ({
  endpoint, branchParam,
  extract(payload) {
    const rows = Array.isArray(payload) ? payload : payload?.[key];
    if (payload?.success === false || !Array.isArray(rows)) throw Error('Branch data unavailable: invalid response');
    return rows;
  },
});
export const BRANCH_DASHBOARD_READS = {
  sales: spec('/branch/walkin-sales', 'branch_id', 'sales'),
  deposits: spec('/branch/deposits', 'branch', 'deposits'),
  expenses: spec('/branch/expenses', 'branch', 'expenses'),
};
export const GM_BRANCH_SECTIONS = ['sales', 'deposits'];
export const FINANCE_BRANCH_SECTIONS = ['sales', 'deposits', 'expenses'];

// This list selects reads, not authority: every GET still passes server session
// authorization. Never substitute names or infer identity from amount/date.
export async function readAuthorizedBranches(branches, readSpec, commonParams = {}, read = api.get) {
  const uniqueBranches = [...new Map(branches.map(branch => [branch.id, branch])).values()];
  const results = await Promise.allSettled(uniqueBranches.map(async branch => {
    const params = new URLSearchParams(commonParams);
    params.set(readSpec.branchParam, branch.id);
    return readSpec.extract(await read(`${readSpec.endpoint}?${params}`));
  }));
  const rows = [], failures = [], seen = new Set();
  results.forEach((result, index) => {
    const branch = uniqueBranches[index];
    if (result.status === 'rejected') {
      failures.push({ branchId: branch.id, branchName: branch.name, status: result.reason?.status,
        message: result.reason?.message || 'Branch data unavailable' });
      return;
    }
    for (const row of result.value) {
      const id = row.id ?? row.sale_id ?? row.receipt_id ?? row.deposit_id ?? row.expense_id ?? row.receipt_no;
      if (id != null && id !== '') {
        const identity = String(id);
        if (seen.has(identity)) continue;
        seen.add(identity);
      }
      rows.push(row);
    }
  });
  return { rows, failures };
}

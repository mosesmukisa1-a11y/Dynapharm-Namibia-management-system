// Keep the existing sales endpoint's explicit-branch protection. The dashboard
// can aggregate authorized branch reads; it must not weaken that API contract.
export async function readStockDashboardSales({branch,user,branchIds,read}) {
  const sales=result=>Array.isArray(result) ? result : result.sales || result.walkin_sales || [];
  if(branch && branch!=='all') {
    if(!branchIds.includes(branch))return []; // Warehouse/country scope is not a sales branch.
    return sales(await read(`branch_id=${encodeURIComponent(branch)}`));
  }
  if(['admin','gm','director'].includes(String(user?.role || '').toLowerCase())) {
    const pages=await Promise.all(branchIds.map(id=>read(`branch_id=${encodeURIComponent(id)}`)));
    return pages.flatMap(sales);
  }
  // Reporting staff retain existing all-branch authority; scoped staff are
  // restricted by the endpoint's session middleware, not by browser claims.
  return sales(await read(''));
}

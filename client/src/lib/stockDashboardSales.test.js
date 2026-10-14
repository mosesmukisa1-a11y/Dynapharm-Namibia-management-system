import {it,expect,vi} from 'vitest';
import {readStockDashboardSales} from './stockDashboardSales';
it.each(['admin','gm','director'])('keeps explicit branch reads for %s company dashboard',async role=>{
  const read=vi.fn(async query=>({sales:[{id:query}]}));
  const rows=await readStockDashboardSales({branch:'all',user:{role},branchIds:['townshop','swakopmund'],read});
  expect(read.mock.calls).toEqual([['branch_id=townshop'],['branch_id=swakopmund']]);
  expect(rows).toHaveLength(2);
});
it('reads only the selected branch, not a warehouse masquerading as a sales branch',async()=>{
  const read=vi.fn(async()=>({sales:[]}));
  await readStockDashboardSales({branch:'townshop',user:{role:'admin'},branchIds:['townshop'],read});
  expect(read).toHaveBeenCalledWith('branch_id=townshop');
  read.mockClear();
  expect(await readStockDashboardSales({branch:'country_stock',user:{role:'admin'},branchIds:['townshop'],read})).toEqual([]);
  expect(read).not.toHaveBeenCalled();
});
it('retains server-enforced reporting and scoped-staff reads',async()=>{
  const read=vi.fn(async()=>({sales:[]}));
  await readStockDashboardSales({branch:'all',user:{role:'stock'},branchIds:['townshop'],read});
  expect(read).toHaveBeenCalledWith('');
});

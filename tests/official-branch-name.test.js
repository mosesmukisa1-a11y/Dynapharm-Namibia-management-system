// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { officialBranchName, normalizeBranchSlug } from '../api/_lib/branchUtils.js';
import { postActivityRecord } from '../api/_lib/activityCapture.js';
import { query } from '../api/db.js';

vi.mock('../api/db.js',()=>({query:vi.fn().mockResolvedValue({rows:[]})}));
beforeEach(()=>vi.clearAllMocks());

it.each(['townshop','Townshop','Windhoek CBD','windhoek_cbd',' cbd '])(
  'uses Windhoek CBD as the official name for branch alias %s',alias=>{
    expect(normalizeBranchSlug(alias)).toBe('townshop');
    expect(officialBranchName(alias,'Townshop')).toBe('Windhoek CBD');
  });
it('does not confuse the warehouse or another branch with Windhoek CBD',()=>{
  expect(officialBranchName('windhoek_warehouse','Windhoek warehouse')).toBe('Windhoek warehouse');
  expect(officialBranchName('tsumeb','Tsumeb')).toBe('Tsumeb');
});
it('stores the official activity name without changing linked identity or monetary values',async()=>{
  await postActivityRecord({id:'branch-label-test',branch_id:'townshop',branch_name:'townshop',
    service_date:'2026-10-09',activity_type:'prescription_dispensing',product_total_dp:623,
    product_total_cp:810,total_qty:1,grand_total:810,form_reference_id:'original-reference'});
  const params=query.mock.calls[0][1];
  expect(params[0]).toBe('branch-label-test');
  expect(params[1]).toBe('townshop');
  expect(params[2]).toBe('Windhoek CBD');
  expect(params[13]).toBe('original-reference');
  expect(params.slice(15,19)).toEqual([623,810,1,810]);
});

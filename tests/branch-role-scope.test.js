import {it,expect} from 'vitest';
import {getBranchScope} from '../api/_lib/auth.js';
it.each(['branch','branch_staff','branch_sales','branch_manager','stock_manager','dispenser','consultant','frontdesk'])(
  '%s never receives unrestricted stock scope',role=>{
    expect(getBranchScope({role,branch:'townshop',branches:['swakopmund']}))
      .toMatchObject({enforced:true,branches:['townshop','swakopmund']});
    expect(getBranchScope({role})).toMatchObject({enforced:true,branches:[]});
  });
it('normalizes role casing/spacing and retains company authority for existing administrative/reporting roles',()=>{
  expect(getBranchScope({role:' BRANCH_STAFF ',branch:'townshop'}).enforced).toBe(true);
  for(const role of ['admin','gm','director','finance','mis','stock'])expect(getBranchScope({role}).enforced).toBe(false);
});

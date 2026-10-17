// @vitest-environment node
import { it, expect } from 'vitest';import {
  query } from "./helpers/owned-raw-database.js";
import { memberEligibility, requireMemberWrite } from '../api/services/memberEligibility.js';
it('allows an admin preview but requires their own approved active membership for member writes', async () => {
  const code = 'TEST-NB-PREVIEW';
  try {
    const user = { id: 'synthetic-admin', role: 'admin', username: code };
    expect((await memberEligibility(user)).eligible).toBe(false);
    await expect(requireMemberWrite(user, code)).rejects.toMatchObject({ statusCode: 403 });
    await query("INSERT INTO distributors(id,distributor_code,distributor_name,status) VALUES('TEST-PREVIEW',$1,'Synthetic member','active')", [code]);
    await query("INSERT INTO distributor_agreements(id,nb_number,first_name,last_name,processing_branch,status) VALUES('TEST-PREVIEW',$1,'Synthetic','Member','townshop','pending_payment')", [code]);
    expect((await memberEligibility(user)).eligible).toBe(false);
    await query("UPDATE distributor_agreements SET status='approved' WHERE id='TEST-PREVIEW'");
    expect((await requireMemberWrite(user, code)).eligible).toBe(true);
    await expect(requireMemberWrite(user, 'SOMEONE-ELSE')).rejects.toMatchObject({ statusCode: 403 });
    await query("UPDATE distributors SET status='inactive' WHERE id='TEST-PREVIEW'");
    expect((await memberEligibility(user)).eligible).toBe(false);
  } finally {
    await query("DELETE FROM distributor_agreements WHERE id='TEST-PREVIEW'");
    await query("DELETE FROM distributors WHERE id='TEST-PREVIEW'");
  }
});

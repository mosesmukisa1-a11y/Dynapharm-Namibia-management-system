import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { getMany, getOne } from '../db.js';
import { getBranchScope } from '../_lib/auth.js';
import { branchSearchTerms } from '../_lib/branchUtils.js';
import { getPackageComponents } from '../_lib/packageDefinitions.js';
import { deny } from './clientHistoryAccess.js';

export function authorizePending(user, branch) {
  if (!user) deny('Authentication required', 401);
  if (!['admin', 'branch_manager', 'dispenser'].includes(user.role)) deny('Branch dispensing access required');
  if (!branch) deny('Select a branch', 400);
  if (user.role === 'admin') return;
  const scope = getBranchScope(user);
  if (!scope.branches?.some((b) => branchSearchTerms(b).includes(branch))) deny('Form is outside your assigned branch');
}
export async function historyQuantities(e) {
  const evidence = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/offSystemFulfilment.js:16:0"), [e.id]);
  const issued = new Map();
  for (const row of evidence) for (const i of row.items) issued.set(i.name, (issued.get(i.name) || 0) + Number(i.quantity));
  return (e.data.medicines || []).map((m) => ({ ...m, liveDispensed: issued.get(m.name) || 0,
    dispensed: Number(m.alreadyDispensed || 0) + (issued.get(m.name) || 0),
    outstanding: Math.max(0, Number(m.quantity) - Number(m.alreadyDispensed || 0) - (issued.get(m.name) || 0)) }));
}
export async function pendingForm(e) {
  const client = await __qd_executePlan(getOne, __qd_registeredPlan("api/services/offSystemFulfilment.js:24:1"), [e.client_id]);
  // A captured NB is not itself approval: require a current active membership
  // and approved agreement before the saved client's NB can receive DP prices.
  const code = String(client?.data?.nbNumber || '').trim().toUpperCase();
  const member = code ? await __qd_executePlan(getOne, __qd_registeredPlan("api/services/offSystemFulfilment.js:28:2"),

  [code]) : null;
  const customerType = member ? 'member' : 'non-member';
  const prices = await __qd_executePlan(getMany, __qd_registeredPlan("api/services/offSystemFulfilment.js:32:3"), []);
  const map = new Map(prices.map((p) => [p.description.toLowerCase().trim(), p]));
  const quantities = await historyQuantities(e);
  for (const item of quantities) {
    const pkg = getPackageComponents(item.name);
    const products = pkg ? pkg.products : [{ name: item.name, quantity: 1 }];
    let total = 0,error = '';
    if (item.unit !== 'unit') error = 'Non-base units require source clarification before dispensing';
    if (!map.has(item.name.toLowerCase().trim())) error = 'Medicine is not in the active catalogue';
    for (const comp of products) {
      const price = Number(map.get(comp.name.toLowerCase().trim())?.[member ? 'dp' : 'cp']);
      if (!Number.isFinite(price) || price <= 0) error = 'Current selling price is missing; resolve before dispensing';
      total += Math.round(price * 100) / 100 * Number(comp.quantity || 1);
    }
    item.unitPrice = error ? null : Math.round(total * 100) / 100;item.issueError = error || null;
  }
  return { ...e, client_name: client?.full_name, quantities, customerType, nbNumber: member?.distributor_code || null,
    pricingLabel: member ? 'Approved member — DP' : 'Non-member — CP' };
}

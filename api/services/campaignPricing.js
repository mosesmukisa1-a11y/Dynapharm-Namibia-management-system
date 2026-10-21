import { branchSearchTerms } from '../_lib/branchUtils.js';
import { campaignConditions } from '../../shared/campaignPricing.js';
export function assertCampaignEligible(campaign, branch, now = new Date()) {
  if (!['approved', 'active', 'upcoming'].includes(campaign.status) ||
      !(now >= new Date(campaign.start_date) && now <= new Date(campaign.end_date)))
    throw Object.assign(new Error('Campaign is not currently active or approved'), { statusCode: 400 });
  const scope = String(campaign.scope || '').toLowerCase();
  if (['', 'all', 'nationwide', 'countrywide'].includes(scope)) return;
  const c = campaignConditions(campaign);
  const targets = [...(Array.isArray(campaign.target_branches) ? campaign.target_branches : []),
    ...(c.target_branches || []), ...(c.stock_assignments || []).map(a => a.branch)].filter(b => b && b !== 'all');
  const aliases = branchSearchTerms(branch).map(b => b.toLowerCase());
  if (targets.length && !targets.some(b => branchSearchTerms(b).some(a => aliases.includes(a.toLowerCase()))))
    throw Object.assign(new Error('This campaign does not target the specified branch'), { statusCode: 403 });
}

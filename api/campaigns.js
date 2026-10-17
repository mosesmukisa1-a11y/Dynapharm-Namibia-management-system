import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "./services/queryDescriptors.js";import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne, withTransaction } from './db.js';

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => raw += c);
    req.on('end', () => {
      try {resolve(raw ? JSON.parse(raw) : {});}
      catch {reject(new Error('Invalid JSON'));}
    });
    req.on('error', reject);
  });
}

function genId(prefix = 'CAMP') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

import { atomicStockRequest } from './_lib/atomicStockRequest.js';
async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `http://localhost`);
  const path = url.pathname.replace(/^\/api\/campaigns/, '');
  const searchParams = url.searchParams;

  try {
    // ── GET /api/campaigns ─────────────────────────────────────────────────────
    if (req.method === 'GET' && (path === '' || path === '/')) {
      // Auto-expire: campaigns whose end_date has passed automatically become 'completed'
      await __qd_executePlan(query, __qd_registeredPlan("api/campaigns.js:35:0"), []).


      catch(() => {});
      const status = searchParams.get('status');
      let sql = __qd_registeredPlan("api/campaigns.js:39:1");
      const params = [];
      if (status) {
        sql = __qd_registeredPlan("api/campaigns.js:42:2");
        params.push(status);
      }
      const campaigns = await __qd_executePlan(getMany, sql, params);
      return res.json({ campaigns });
    }

    // ── GET /api/campaigns/analytics ─────────────────────────────────────────
    // NOTE: must appear BEFORE /:id so "analytics" is not treated as an id
    if (req.method === 'GET' && path === '/analytics') {
      const [overview, typeBreakdown, winnerStats, campaignDetails,
      distributorLeaderboard, branchBvRanking, recentWinners, campaignSales] = await Promise.all([

      // 1. Overview counts
      __qd_executePlan(getOne, __qd_registeredPlan("api/campaigns.js:56:3"), []),










      // 2. Type breakdown
      __qd_executePlan(getMany, __qd_registeredPlan("api/campaigns.js:68:4"), []),







      // 3. Winner summary
      __qd_executePlan(getOne, __qd_registeredPlan("api/campaigns.js:77:5"), []),









      // 4. Per-campaign detail with embedded participants and winners
      __qd_executePlan(getMany, __qd_registeredPlan("api/campaigns.js:88:6"), []),




















































      // 5. Distributor leaderboard — top by cumulative BV across all campaigns
      __qd_executePlan(getMany, __qd_registeredPlan("api/campaigns.js:142:7"), []),














      // 6. Branch ranking by total BV
      __qd_executePlan(getMany, __qd_registeredPlan("api/campaigns.js:158:8"), []),












      // 7. Recent winners with campaign info
      __qd_executePlan(getMany, __qd_registeredPlan("api/campaigns.js:172:9"), []),







      // 8. Campaign-tagged stock movements (product-level sales) with discount %
      __qd_executePlan(getMany, __qd_registeredPlan("api/campaigns.js:181:10"), [])]













      );

      // Total campaign sales figures
      const salesTotal = campaignSales.reduce(
        (acc, r) => {acc.total_units += Number(r.total_qty || 0);acc.dp_value += Number(r.dp_value || 0);return acc;},
        { total_units: 0, dp_value: 0 }
      );

      return res.json({
        overview,
        typeBreakdown,
        winnerStats,
        campaignDetails,
        distributorLeaderboard,
        branchBvRanking,
        recentWinners,
        campaignSales: salesTotal,
        campaignProducts: campaignSales
      });
    }

    // ── GET /api/campaigns/:id ─────────────────────────────────────────────────
    if (req.method === 'GET' && path.match(/^\/[^/]+$/)) {
      const id = path.slice(1);
      const campaign = await __qd_executePlan(getOne, __qd_registeredPlan("api/campaigns.js:219:11"), [id]);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      const participants = await __qd_executePlan(getMany, __qd_registeredPlan("api/campaigns.js:222:12"),
      [id]);

      const winners = await __qd_executePlan(getMany, __qd_registeredPlan("api/campaigns.js:225:13"),
      [id]);

      return res.json({ campaign, participants, winners });
    }

    // ── GET /api/campaigns/:id/participants ────────────────────────────────────
    if (req.method === 'GET' && path.match(/^\/[^/]+\/participants$/)) {
      const id = path.split('/')[1];
      const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/campaigns.js:234:14"),
      [id]);

      return res.json({ participants: rows });
    }

    // ── GET /api/campaigns/:id/winners ─────────────────────────────────────────
    if (req.method === 'GET' && path.match(/^\/[^/]+\/winners$/)) {
      const id = path.split('/')[1];
      const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/campaigns.js:243:15"),
      [id]);

      return res.json({ winners: rows });
    }

    // ── POST /api/campaigns ────────────────────────────────────────────────────
    if (req.method === 'POST' && (path === '' || path === '/')) {
      const body = await parseJsonBody(req);
      const id = genId('CAMP');
      const {
        name, description = '', campaign_type = 'custom',
        start_date, end_date,
        branch = 'countrywide', scope = 'countrywide',
        conditions = {}, prize = {},
        discount_percentage = 0,
        target_branches = [],
        submitted_by = null,
        stock_assignments = []
      } = body;

      if (!name || !start_date || !end_date) {
        return res.status(400).json({ error: 'name, start_date and end_date are required' });
      }

      // Role-based status enforcement
      const userRole = req.user?.role || '';
      const gmRoles = ['gm', 'admin', 'director'];
      const stockRoles = ['stock'];
      const allowedCreatorRoles = [...gmRoles, ...stockRoles];
      if (!allowedCreatorRoles.includes(userRole)) {
        return res.status(403).json({ error: 'Only stock or GM users can create campaigns' });
      }

      let status;
      if (gmRoles.includes(userRole)) {
        // GM/admin/director can create with any valid status
        status = body.status || 'upcoming';
      } else {
        // Stock users must create in pending_approval (enforced server-side)
        if (body.status && body.status !== 'pending_approval') {
          return res.status(403).json({ error: 'Stock users can only create campaigns pending GM approval' });
        }
        status = 'pending_approval';
      }

      const effectiveSubmittedBy = submitted_by || (status === 'pending_approval' ? req.user?.username || null : null);

      const conditionsWithAssignments = {
        ...conditions,
        stock_assignments: Array.isArray(stock_assignments) ? stock_assignments.filter((a) => a.product) : []
      };

      await __qd_executePlan(query, __qd_registeredPlan("api/campaigns.js:296:16"),


      [id, name, description, campaign_type, start_date, end_date, status, branch, scope,
      JSON.stringify(conditionsWithAssignments), JSON.stringify(prize),
      Number(discount_percentage) || 0,
      JSON.stringify(Array.isArray(target_branches) ? target_branches : []),
      req.user?.username || 'system',
      effectiveSubmittedBy]);

      const created = await __qd_executePlan(getOne, __qd_registeredPlan("api/campaigns.js:305:17"), [id]);
      return res.status(201).json({ success: true, campaign: created });
    }

    // ── PATCH /api/campaigns/:id/review ────────────────────────────────────────
    if (req.method === 'PATCH' && path.match(/^\/[^/]+\/review$/)) {
      const reviewerRole = req.user?.role || '';
      const allowedReviewerRoles = ['gm', 'admin', 'director'];
      if (!allowedReviewerRoles.includes(reviewerRole)) {
        return res.status(403).json({ error: 'Only the GM, admin, or director can approve or reject campaigns' });
      }

      const id = path.split('/')[1];
      const body = await parseJsonBody(req);
      const { action, rejection_note = '' } = body;

      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'action must be "approve" or "reject"' });
      }

      const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/campaigns.js:325:18"), [id]);
      if (!existing) return res.status(404).json({ error: 'Campaign not found' });

      const decision = action === 'approve' ? 'upcoming' : 'rejected';
      if (existing.status === decision) return res.json({ success: true, campaign: existing });
      if (existing.status !== 'pending_approval') {
        return res.status(409).json({ error: 'Campaign is not pending approval' });
      }

      const newStatus = action === 'approve' ? 'upcoming' : 'rejected';
      await __qd_executePlan(query, __qd_registeredPlan("api/campaigns.js:336:19"),

      [newStatus, action === 'reject' ? rejection_note : null, req.user?.username || 'gm', id]);


      const updated = await __qd_executePlan(getOne, __qd_registeredPlan("api/campaigns.js:340:20"), [id]);
      return res.json({ success: true, campaign: updated });
    }

    // ── PUT /api/campaigns/:id ─────────────────────────────────────────────────
    if (req.method === 'PUT' && path.match(/^\/[^/]+$/)) {
      const editRole = req.user?.role || '';
      if (!['gm', 'admin', 'director', 'stock'].includes(editRole)) {
        return res.status(403).json({ error: 'Only GM, admin, or stock users can edit campaigns' });
      }
      const id = path.slice(1);
      const body = await parseJsonBody(req);
      const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/campaigns.js:352:21"), [id]);
      if (!existing) return res.status(404).json({ error: 'Campaign not found' });

      const fields = ['name', 'description', 'campaign_type', 'start_date', 'end_date', 'status', 'branch', 'scope', 'discount_percentage'];
      const jsonFields = ['conditions', 'prize', 'target_branches'];
      const setClauses = [];
      const vals = [];
      let idx = 1;
      for (const f of fields) {
        if (body[f] !== undefined) {setClauses.push(__qd_registeredPlan("api/campaigns.js:361:22", [f, idx++]));vals.push(body[f]);}
      }
      for (const f of jsonFields) {
        if (body[f] !== undefined) {setClauses.push(__qd_registeredPlan("api/campaigns.js:364:23", [f, idx++]));vals.push(JSON.stringify(body[f]));}
      }
      setClauses.push(__qd_registeredPlan("api/campaigns.js:366:24"));
      vals.push(id);
      await __qd_executePlan(query, __qd_registeredPlan("api/campaigns.js:368:25", [__qd_joinPlans(setClauses, "comma"), idx]), vals);
      const updated = await __qd_executePlan(getOne, __qd_registeredPlan("api/campaigns.js:369:26"), [id]);
      return res.json({ success: true, campaign: updated });
    }

    // ── DELETE /api/campaigns/:id ──────────────────────────────────────────────
    if (req.method === 'DELETE' && path.match(/^\/[^/]+$/)) {
      const delRole = req.user?.role || '';
      if (!['gm', 'admin', 'director', 'stock'].includes(delRole)) {
        return res.status(403).json({ error: 'Only GM, admin, or stock users can delete campaigns' });
      }
      const id = path.slice(1);
      await __qd_executePlan(query, __qd_registeredPlan("api/campaigns.js:380:27"), [id]);
      await __qd_executePlan(query, __qd_registeredPlan("api/campaigns.js:381:28"), [id]);
      await __qd_executePlan(query, __qd_registeredPlan("api/campaigns.js:382:29"), [id]);
      return res.json({ success: true });
    }

    // ── POST /api/campaigns/:id/participants ────────────────────────────────────
    if (req.method === 'POST' && path.match(/^\/[^/]+\/participants$/)) {
      const campaignId = path.split('/')[1];
      const body = await parseJsonBody(req);
      const { distributor_code, distributor_name, branch } = body;
      if (!distributor_code) return res.status(400).json({ error: 'distributor_code required' });

      const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/campaigns.js:394:30"),

      [campaignId, distributor_code]);

      if (existing) return res.status(409).json({ error: 'Already enrolled in this campaign' });

      const id = genId('PART');
      await __qd_executePlan(query, __qd_registeredPlan("api/campaigns.js:401:31"),


      [id, campaignId, distributor_code, distributor_name || distributor_code, branch || '', body.notes || '']);

      const part = await __qd_executePlan(getOne, __qd_registeredPlan("api/campaigns.js:405:32"), [id]);
      return res.status(201).json({ success: true, participant: part });
    }

    // ── DELETE /api/campaigns/:id/participants/:pid ─────────────────────────────
    if (req.method === 'DELETE' && path.match(/^\/[^/]+\/participants\/[^/]+$/)) {
      const parts = path.split('/');
      const pid = parts[3];
      await __qd_executePlan(query, __qd_registeredPlan("api/campaigns.js:413:33"), [pid]);
      return res.json({ success: true });
    }

    // ── PATCH /api/campaigns/:id/participants/:pid ─────────────────────────────
    if (req.method === 'PATCH' && path.match(/^\/[^/]+\/participants\/[^/]+$/)) {
      const parts = path.split('/');
      const pid = parts[3];
      const body = await parseJsonBody(req);
      const allowed = ['current_bv', 'current_recruits', 'status', 'notes'];
      const setClauses = [];
      const vals = [];
      let idx = 1;
      for (const f of allowed) {
        if (body[f] !== undefined) {setClauses.push(__qd_registeredPlan("api/campaigns.js:427:34", [f, idx++]));vals.push(body[f]);}
      }
      if (!setClauses.length) return res.status(400).json({ error: 'Nothing to update' });
      vals.push(pid);
      await __qd_executePlan(query, __qd_registeredPlan("api/campaigns.js:431:35", [__qd_joinPlans(setClauses, "comma"), idx]), vals);
      const updated = await __qd_executePlan(getOne, __qd_registeredPlan("api/campaigns.js:432:36"), [pid]);
      return res.json({ success: true, participant: updated });
    }

    // ── POST /api/campaigns/:id/generate-winners ───────────────────────────────
    if (req.method === 'POST' && path.match(/^\/[^/]+\/generate-winners$/)) {
      const campaignId = path.split('/')[1];
      const campaign = await __qd_executePlan(getOne, __qd_registeredPlan("api/campaigns.js:439:37"), [campaignId]);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

      const conditions = typeof campaign.conditions === 'string' ?
      JSON.parse(campaign.conditions || '{}') :
      campaign.conditions || {};
      const prize = typeof campaign.prize === 'string' ?
      JSON.parse(campaign.prize || '{}') :
      campaign.prize || {};
      const participants = await __qd_executePlan(getMany, __qd_registeredPlan("api/campaigns.js:449:38"),
      [campaignId]);


      const winners = [];

      // ── BV Achievement / tiered prize ──────────────────────────────────────
      if (campaign.campaign_type === 'bv_achievement') {
        const tiers = Array.isArray(prize.tiers) ? prize.tiers : [];
        for (const p of participants) {
          const bv = Number(p.current_bv || 0);
          let matchedTier = null;
          for (const tier of tiers.sort((a, b) => Number(b.bv_required) - Number(a.bv_required))) {
            if (bv >= Number(tier.bv_required)) {matchedTier = tier;break;}
          }
          if (matchedTier) {
            winners.push({ participant: p, prize_tier: matchedTier.label, prize_description: matchedTier.prize, rank: 1 });
          }
        }
      }

      // ── Elite Bingo ──────────────────────────────────────────────────────────
      else if (campaign.campaign_type === 'elite_bingo') {
        const minBv = Number(conditions.min_bv || 3000);
        const minRecruits = Number(conditions.min_recruits || 2);
        const reward = prize.cash_reward || prize.description || '';
        for (const p of participants) {
          if (Number(p.current_bv || 0) >= minBv && Number(p.current_recruits || 0) >= minRecruits) {
            winners.push({ participant: p, prize_tier: 'Elite Bingo Winner', prize_description: reward, rank: 1 });
          }
        }
      }

      // ── Buy X Get Y ──────────────────────────────────────────────────────────
      else if (campaign.campaign_type === 'buy_x_get_y') {
        for (const p of participants) {
          if (p.status === 'qualified') {
            winners.push({ participant: p, prize_tier: prize.description || 'Qualified', prize_description: prize.free_product || prize.description || '', rank: 1 });
          }
        }
      }

      // ── Discount Campaign ─────────────────────────────────────────────────────
      else if (campaign.campaign_type === 'discount') {
        for (const p of participants) {
          winners.push({ participant: p, prize_tier: 'Eligible for Discount', prize_description: `${campaign.discount_percentage}% off`, rank: 1 });
        }
      }

      // ── Custom / fallback: rank by current_bv desc ────────────────────────────
      else {
        const sorted = [...participants].sort((a, b) => Number(b.current_bv) - Number(a.current_bv));
        const topN = Number(conditions.max_winners || sorted.length);
        sorted.slice(0, topN).forEach((p, i) => {
          winners.push({ participant: p, prize_tier: prize.description || 'Winner', prize_description: prize.value || '', rank: i + 1 });
        });
      }

      // Persist winners
      await withTransaction(async (client) => {
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/campaigns.js:508:39"), [campaignId]);
        for (const w of winners) {
          const wid = genId('WIN');
          await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/campaigns.js:512:40"),


          [wid, campaignId, w.participant.distributor_code, w.participant.distributor_name,
          w.participant.branch, w.prize_tier, w.prize_description, w.rank,
          req.user?.username || 'system', '']);

        }
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/campaigns.js:519:41"), [campaignId]);
      });

      const finalWinners = await __qd_executePlan(getMany, __qd_registeredPlan("api/campaigns.js:523:42"),
      [campaignId]);

      return res.json({ success: true, winners_generated: finalWinners.length, winners: finalWinners });
    }

    // ── PATCH /api/campaigns/:id/winners/:wid ──────────────────────────────────
    if (req.method === 'PATCH' && path.match(/^\/[^/]+\/winners\/[^/]+$/)) {
      const parts = path.split('/');
      const wid = parts[3];
      const body = await parseJsonBody(req);
      const allowed = ['status', 'verified_by', 'notes'];
      const setClauses = [];
      const vals = [];
      let idx = 1;
      for (const f of allowed) {
        if (body[f] !== undefined) {setClauses.push(__qd_registeredPlan("api/campaigns.js:538:43", [f, idx++]));vals.push(body[f]);}
      }
      if (!setClauses.length) return res.status(400).json({ error: 'Nothing to update' });
      vals.push(wid);
      await __qd_executePlan(query, __qd_registeredPlan("api/campaigns.js:542:44", [__qd_joinPlans(setClauses, "comma"), idx]), vals);
      const updated = await __qd_executePlan(getOne, __qd_registeredPlan("api/campaigns.js:543:45"), [wid]);
      return res.json({ success: true, winner: updated });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Campaigns API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
export default atomicStockRequest(handler);

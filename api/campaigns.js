import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne, withTransaction } from './db.js';

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function genId(prefix = 'CAMP') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `http://localhost`);
  const path = url.pathname.replace(/^\/api\/campaigns/, '');
  const searchParams = url.searchParams;

  try {
    // ── GET /api/campaigns ─────────────────────────────────────────────────────
    if (req.method === 'GET' && (path === '' || path === '/')) {
      const status = searchParams.get('status');
      let sql = `SELECT * FROM campaigns ORDER BY created_at DESC`;
      const params = [];
      if (status) {
        sql = `SELECT * FROM campaigns WHERE status = $1 ORDER BY created_at DESC`;
        params.push(status);
      }
      const campaigns = await getMany(sql, params);
      return res.json({ campaigns });
    }

    // ── GET /api/campaigns/:id ─────────────────────────────────────────────────
    if (req.method === 'GET' && path.match(/^\/[^/]+$/)) {
      const id = path.slice(1);
      const campaign = await getOne(`SELECT * FROM campaigns WHERE id = $1`, [id]);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      const participants = await getMany(
        `SELECT * FROM campaign_participants WHERE campaign_id = $1 ORDER BY enrolled_at DESC`, [id]
      );
      const winners = await getMany(
        `SELECT * FROM campaign_winners WHERE campaign_id = $1 ORDER BY won_at DESC`, [id]
      );
      return res.json({ campaign, participants, winners });
    }

    // ── GET /api/campaigns/:id/participants ────────────────────────────────────
    if (req.method === 'GET' && path.match(/^\/[^/]+\/participants$/)) {
      const id = path.split('/')[1];
      const rows = await getMany(
        `SELECT * FROM campaign_participants WHERE campaign_id = $1 ORDER BY enrolled_at DESC`, [id]
      );
      return res.json({ participants: rows });
    }

    // ── GET /api/campaigns/:id/winners ─────────────────────────────────────────
    if (req.method === 'GET' && path.match(/^\/[^/]+\/winners$/)) {
      const id = path.split('/')[1];
      const rows = await getMany(
        `SELECT * FROM campaign_winners WHERE campaign_id = $1 ORDER BY prize_rank ASC, won_at DESC`, [id]
      );
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
        stock_assignments = [],
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

      const effectiveSubmittedBy = submitted_by || (status === 'pending_approval' ? (req.user?.username || null) : null);

      const conditionsWithAssignments = {
        ...conditions,
        stock_assignments: Array.isArray(stock_assignments) ? stock_assignments.filter(a => a.product) : [],
      };

      await query(
        `INSERT INTO campaigns (id, name, description, campaign_type, start_date, end_date, status, branch, scope, conditions, prize, discount_percentage, target_branches, created_by, submitted_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())`,
        [id, name, description, campaign_type, start_date, end_date, status, branch, scope,
         JSON.stringify(conditionsWithAssignments), JSON.stringify(prize),
         Number(discount_percentage) || 0,
         JSON.stringify(Array.isArray(target_branches) ? target_branches : []),
         req.user?.username || 'system',
         effectiveSubmittedBy]
      );
      const created = await getOne(`SELECT * FROM campaigns WHERE id = $1`, [id]);
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

      const existing = await getOne(`SELECT * FROM campaigns WHERE id = $1`, [id]);
      if (!existing) return res.status(404).json({ error: 'Campaign not found' });

      if (existing.status !== 'pending_approval') {
        return res.status(400).json({ error: 'Campaign is not pending approval' });
      }

      const newStatus = action === 'approve' ? 'upcoming' : 'rejected';
      await query(
        `UPDATE campaigns SET status = $1, rejection_note = $2, reviewed_at = NOW(), reviewed_by = $3, updated_at = NOW() WHERE id = $4`,
        [newStatus, action === 'reject' ? rejection_note : null, req.user?.username || 'gm', id]
      );

      const updated = await getOne(`SELECT * FROM campaigns WHERE id = $1`, [id]);
      return res.json({ success: true, campaign: updated });
    }

    // ── PUT /api/campaigns/:id ─────────────────────────────────────────────────
    if (req.method === 'PUT' && path.match(/^\/[^/]+$/)) {
      const id = path.slice(1);
      const body = await parseJsonBody(req);
      const existing = await getOne(`SELECT * FROM campaigns WHERE id = $1`, [id]);
      if (!existing) return res.status(404).json({ error: 'Campaign not found' });

      const fields = ['name', 'description', 'campaign_type', 'start_date', 'end_date', 'status', 'branch', 'scope', 'discount_percentage'];
      const jsonFields = ['conditions', 'prize', 'target_branches'];
      const setClauses = [];
      const vals = [];
      let idx = 1;
      for (const f of fields) {
        if (body[f] !== undefined) { setClauses.push(`${f} = $${idx++}`); vals.push(body[f]); }
      }
      for (const f of jsonFields) {
        if (body[f] !== undefined) { setClauses.push(`${f} = $${idx++}`); vals.push(JSON.stringify(body[f])); }
      }
      setClauses.push(`updated_at = NOW()`);
      vals.push(id);
      await query(`UPDATE campaigns SET ${setClauses.join(', ')} WHERE id = $${idx}`, vals);
      const updated = await getOne(`SELECT * FROM campaigns WHERE id = $1`, [id]);
      return res.json({ success: true, campaign: updated });
    }

    // ── DELETE /api/campaigns/:id ──────────────────────────────────────────────
    if (req.method === 'DELETE' && path.match(/^\/[^/]+$/)) {
      const id = path.slice(1);
      await query(`DELETE FROM campaign_winners WHERE campaign_id = $1`, [id]);
      await query(`DELETE FROM campaign_participants WHERE campaign_id = $1`, [id]);
      await query(`DELETE FROM campaigns WHERE id = $1`, [id]);
      return res.json({ success: true });
    }

    // ── POST /api/campaigns/:id/participants ────────────────────────────────────
    if (req.method === 'POST' && path.match(/^\/[^/]+\/participants$/)) {
      const campaignId = path.split('/')[1];
      const body = await parseJsonBody(req);
      const { distributor_code, distributor_name, branch } = body;
      if (!distributor_code) return res.status(400).json({ error: 'distributor_code required' });

      const existing = await getOne(
        `SELECT id FROM campaign_participants WHERE campaign_id=$1 AND distributor_code=$2`,
        [campaignId, distributor_code]
      );
      if (existing) return res.status(409).json({ error: 'Already enrolled in this campaign' });

      const id = genId('PART');
      await query(
        `INSERT INTO campaign_participants (id, campaign_id, distributor_code, distributor_name, branch, enrolled_at, status, current_bv, current_recruits, notes)
         VALUES ($1,$2,$3,$4,$5,NOW(),'active',0,0,$6)`,
        [id, campaignId, distributor_code, distributor_name || distributor_code, branch || '', body.notes || '']
      );
      const part = await getOne(`SELECT * FROM campaign_participants WHERE id=$1`, [id]);
      return res.status(201).json({ success: true, participant: part });
    }

    // ── DELETE /api/campaigns/:id/participants/:pid ─────────────────────────────
    if (req.method === 'DELETE' && path.match(/^\/[^/]+\/participants\/[^/]+$/)) {
      const parts = path.split('/');
      const pid = parts[3];
      await query(`DELETE FROM campaign_participants WHERE id=$1`, [pid]);
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
        if (body[f] !== undefined) { setClauses.push(`${f} = $${idx++}`); vals.push(body[f]); }
      }
      if (!setClauses.length) return res.status(400).json({ error: 'Nothing to update' });
      vals.push(pid);
      await query(`UPDATE campaign_participants SET ${setClauses.join(', ')} WHERE id=$${idx}`, vals);
      const updated = await getOne(`SELECT * FROM campaign_participants WHERE id=$1`, [pid]);
      return res.json({ success: true, participant: updated });
    }

    // ── POST /api/campaigns/:id/generate-winners ───────────────────────────────
    if (req.method === 'POST' && path.match(/^\/[^/]+\/generate-winners$/)) {
      const campaignId = path.split('/')[1];
      const campaign = await getOne(`SELECT * FROM campaigns WHERE id=$1`, [campaignId]);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

      const conditions = typeof campaign.conditions === 'string'
        ? JSON.parse(campaign.conditions || '{}')
        : (campaign.conditions || {});
      const prize = typeof campaign.prize === 'string'
        ? JSON.parse(campaign.prize || '{}')
        : (campaign.prize || {});
      const participants = await getMany(
        `SELECT * FROM campaign_participants WHERE campaign_id=$1 AND status='active'`, [campaignId]
      );

      const winners = [];

      // ── BV Achievement / tiered prize ──────────────────────────────────────
      if (campaign.campaign_type === 'bv_achievement') {
        const tiers = Array.isArray(prize.tiers) ? prize.tiers : [];
        for (const p of participants) {
          const bv = Number(p.current_bv || 0);
          let matchedTier = null;
          for (const tier of tiers.sort((a, b) => Number(b.bv_required) - Number(a.bv_required))) {
            if (bv >= Number(tier.bv_required)) { matchedTier = tier; break; }
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
        await client.query(`DELETE FROM campaign_winners WHERE campaign_id=$1`, [campaignId]);
        for (const w of winners) {
          const wid = genId('WIN');
          await client.query(
            `INSERT INTO campaign_winners (id, campaign_id, distributor_code, distributor_name, branch, prize_tier, prize_description, prize_rank, won_at, status, verified_by, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),'pending',$9,$10)`,
            [wid, campaignId, w.participant.distributor_code, w.participant.distributor_name,
             w.participant.branch, w.prize_tier, w.prize_description, w.rank,
             req.user?.username || 'system', '']
          );
        }
        await client.query(`UPDATE campaigns SET status='completed', updated_at=NOW() WHERE id=$1`, [campaignId]);
      });

      const finalWinners = await getMany(
        `SELECT * FROM campaign_winners WHERE campaign_id=$1 ORDER BY prize_rank ASC`, [campaignId]
      );
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
        if (body[f] !== undefined) { setClauses.push(`${f} = $${idx++}`); vals.push(body[f]); }
      }
      if (!setClauses.length) return res.status(400).json({ error: 'Nothing to update' });
      vals.push(wid);
      await query(`UPDATE campaign_winners SET ${setClauses.join(', ')} WHERE id=$${idx}`, vals);
      const updated = await getOne(`SELECT * FROM campaign_winners WHERE id=$1`, [wid]);
      return res.json({ success: true, winner: updated });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Campaigns API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

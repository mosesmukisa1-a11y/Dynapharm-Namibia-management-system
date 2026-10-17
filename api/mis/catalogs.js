import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

function normalizeProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    dp: row.dp !== null ? Number(row.dp) : null,
    cp: row.cp !== null ? Number(row.cp) : null,
    bv: row.bv !== null ? Number(row.bv) : null,
    taxRate: row.tax_rate !== null ? Number(row.tax_rate) : 0,
    category: row.category || null,
    branch: row.branch || null,
    isActive: row.is_active !== false
  };
}

function normalizeDistributor(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.distributor_code,
    name: row.distributor_name,
    mobile: row.mobile_no,
    email: row.email,
    branch: row.branch,
    status: row.status || 'active'
  };
}

function buildBranchList({ products, distributors, salesBranches, draftBranches }) {
  const branches = new Map();
  const push = (id, name) => {
    if (!id) return;
    const key = String(id).toLowerCase();
    if (!branches.has(key)) {
      branches.set(key, {
        id: id,
        name: name || id
      });
    }
  };

  products.forEach((product) => {
    if (product.branch) {
      push(product.branch, product.branch);
    }
  });

  distributors.forEach((dist) => {
    if (dist.branch) {
      push(dist.branch, dist.branch);
    }
  });

  salesBranches.forEach((row) => push(row.branch_id, row.branch_id));
  draftBranches.forEach((row) => push(row.branch_id, row.branch_id));

  if (!branches.has('all')) {
    branches.set('all', { id: 'all', name: 'All Branches' });
  }
  return Array.from(branches.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const [productRows, distributorRows, salesBranches, draftBranches] = await Promise.all([
    // Join product_prices so dp/cp/bv always reflect the current GM price list.
    // product_prices is the authoritative source; the products table columns are
    // legacy fallbacks only.
    __qd_executePlan(getMany, __qd_registeredPlan("api/mis/catalogs.js:86:0"),











    []), __qd_executePlan(

      getMany, __qd_registeredPlan("api/mis/catalogs.js:100:1"),





      []), __qd_executePlan(

      getMany, __qd_registeredPlan("api/mis/catalogs.js:108:2"),





      []), __qd_executePlan(

      getMany, __qd_registeredPlan("api/mis/catalogs.js:116:3"),





      [])]

    );

    const products = productRows.map(normalizeProduct).filter(Boolean);
    const distributors = distributorRows.map(normalizeDistributor).filter(Boolean);
    const branches = buildBranchList({ products, distributors, salesBranches, draftBranches });

    return res.status(200).json({
      success: true,
      catalogs: {
        products,
        distributors,
        branches
      }
    });
  } catch (error) {
    console.error('MIS catalogs API error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error'
    });
  }
}

import { applyAuthCors } from '../_lib/auth.js';
import {
  getDateRange,
  getCompanyStockSummary,
  getAllBranchesSalesRevenue,
} from '../services/gmFinanceMisEngine.js';
import { getOne } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { start, end } = getDateRange(req.query);

    const [companyStock, sales] = await Promise.all([
      getCompanyStockSummary(),
      getAllBranchesSalesRevenue(start, end),
    ]);

    // CIF cost of sales: actual batch unit_cif from stock_movements, fallback to product_prices.cif
    const cifRow = await getOne(
      `SELECT COALESCE(SUM(sm.quantity * COALESCE(sm.unit_cif, pp.cif, 0)), 0) as cif_cost
       FROM stock_movements sm
       LEFT JOIN product_prices pp ON LOWER(TRIM(sm.product_name)) = LOWER(TRIM(pp.description))
       WHERE sm.status = 'posted'
         AND sm.movement_type IN (
           'walkin_sale','walkin_member_sale','walkin_non_member_sale',
           'walk_in_member_sale','walk_in_non_member_sale','sale',
           'online_order_fulfilment','online_order_sale','prescription_dispense'
         )
         AND sm.created_at >= $1::date
         AND sm.created_at <= ($2 || 'T23:59:59')::timestamp`,
      [start, end]
    );
    const cifCostOfSales = Number(cifRow?.cif_cost || 0);

    const grossProfit = sales.totalSales - cifCostOfSales;

    // Confirmed bank deposits in the period
    const depositRow = await getOne(
      `SELECT COALESCE(SUM(amount),0) as total FROM branch_bank_deposits
       WHERE status='confirmed' AND date >= $1::date AND date <= $2::date`,
      [start, end]
    );
    const totalDeposits = Number(depositRow?.total || 0);
    const remittanceDue = Math.max(0, cifCostOfSales - totalDeposits);

    // Total walkin transaction count
    const txnRow = await getOne(
      `SELECT COUNT(*) as cnt FROM branch_walkin_sales
       WHERE status='completed' AND sale_date >= $1::date AND sale_date <= ($2 || 'T23:59:59')::timestamp`,
      [start, end]
    );
    const totalTransactions = Number(txnRow?.cnt || 0);

    // Total BV points from walkin sale items
    const bvRow = await getOne(
      `SELECT COALESCE(SUM((item->>'bv')::numeric), 0) as total_bv
       FROM branch_walkin_sales,
            jsonb_array_elements(CASE WHEN jsonb_typeof(items::jsonb) = 'array' THEN items::jsonb ELSE '[]'::jsonb END) AS item
       WHERE status = 'completed'
         AND sale_date >= $1::date
         AND sale_date <= ($2 || 'T23:59:59')::timestamp`,
      [start, end]
    );
    const totalBV = Number(bvRow?.total_bv || 0);

    // Active branch count
    const branchRow = await getOne(`SELECT COUNT(*) as cnt FROM branches WHERE status = 'active'`);
    const activeBranches = Number(branchRow?.cnt || 0);

    // Product range count
    const productRow = await getOne(`SELECT COUNT(DISTINCT description) as cnt FROM product_prices`);
    const productCount = Number(productRow?.cnt || 0);

    res.json({
      success: true,
      period: { start, end },
      companyStock: {
        totalQty: companyStock.totalQty,
        totalValueDP: companyStock.totalValueDP,
        warehouseQty: companyStock.warehouseQty,
        branchQty: companyStock.branchQty,
        inTransitQty: companyStock.inTransitQty,
        lowStockCount: companyStock.lowStockCount,
        expiringCount: companyStock.expiringCount,
      },
      sales: {
        consultationFees: sales.consultationFees,
        walkinSales: sales.walkinSales,
        memberSales: sales.memberSales,
        nonMemberSales: sales.nonMemberSales,
        onlineSales: sales.onlineSales,
        prescriptionSales: sales.prescriptionSales,
        totalSales: sales.totalSales,
        totalTransactions,
        totalBV,
      },
      finance: {
        cifCostOfSales,
        grossProfit,
        totalDeposits,
        remittanceDue,
      },
      network: {
        activeBranches,
        productCount,
      },
    });
  } catch (err) {
    console.error('[gm/summary]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

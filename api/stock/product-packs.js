import { query } from '../db.js';
import { atomicStockRequest } from '../_lib/atomicStockRequest.js';
import { lifecycleSchema, fail } from '../services/stockCostLayers.js';

async function handler(req,res) {
  if (!req.user) return res.status(401).json({success:false,error:'Authentication required'});
  if (req.method==='GET') return res.json({success:true,rows:(await query('SELECT * FROM stock_product_packs ORDER BY product_name')).rows});
  if (req.method!=='PUT') return res.status(405).json({success:false,error:'Method not allowed'});
  if (!['admin','superadmin','super_admin','stock','stock_manager','gm'].includes(String(req.user.role).toLowerCase()))
    return res.status(403).json({success:false,error:'Stock Manager access required'});
  const {productName,baseUnit,packs}=req.body || {};
  const name=String(productName || '').trim().toLowerCase(),base=String(baseUnit || '').trim().toLowerCase();
  if (!name || !base || !Array.isArray(packs)) fail('Product, base unit and explicit packs are required');
  const normalized=packs.map(p=>({unit:String(p.unit || '').trim().toLowerCase(),factor:Number(p.factor),barcode:String(p.barcode || '').trim() || null}));
  if (normalized.some(p=>!p.unit || (p.unit===base && p.factor!==1) || !Number.isSafeInteger(p.factor) || p.factor<=0)
    || new Set(normalized.map(p=>p.unit)).size!==normalized.length) fail('Each pack needs a unique unit and positive whole base-unit factor');
  // Serialize configuration to prevent two products claiming one barcode.
  await query("SELECT pg_advisory_xact_lock(hashtext('stock-product-pack-config'))");
  const others=(await query('SELECT packs FROM stock_product_packs WHERE product_name<>$1',[name])).rows;
  const codes=normalized.map(p=>p.barcode).filter(Boolean);
  if (new Set(codes).size!==codes.length || others.some(row=>row.packs.some(p=>codes.includes(p.barcode))))
    fail('A pack barcode must identify exactly one product and unit');
  if (codes.length && (await query(`SELECT product_code FROM live_product_prices WHERE product_code=ANY($1::text[])
    UNION ALL SELECT barcode FROM stock_batches WHERE barcode=ANY($1::text[]) OR qr_code=ANY($1::text[])`,[codes])).rowCount)
    fail('Pack barcode conflicts with an existing product or batch barcode');
  await query(`INSERT INTO stock_product_packs(product_name,base_unit,packs) VALUES ($1,$2,$3)
    ON CONFLICT(product_name) DO UPDATE SET base_unit=$2,packs=$3,updated_at=NOW()`,[name,base,JSON.stringify(normalized)]);
  return res.json({success:true,productName:name,baseUnit:base,packs:normalized});
}
export default atomicStockRequest(handler);

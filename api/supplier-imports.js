import {numericPage} from './services/sqlShape.js';
import { applyAuthCors } from './_lib/auth.js';
import { getMany, getOne } from './db.js';
import { atomicStockRequest } from './_lib/atomicStockRequest.js';
import receiveImport from './stock/import/receive.js';

async function handler(req,res) {
  applyAuthCors(req,res);
  if (req.method==='OPTIONS') return res.status(204).end();
  if (!req.user) return res.status(401).json({success:false,error:'Authentication required'});
  const params=new URL(req.url,'http://internal').searchParams;
  if (req.method==='GET') {
    if (params.get('id')) {
      const row=await getOne('SELECT * FROM supplier_imports WHERE id=$1',[params.get('id')]);
      return row ? res.json(row) : res.status(404).json({success:false,error:'Import not found'});
    }
    const values=[params.get('warehouse')||null,params.get('supplier')?`%${params.get('supplier')}%`:null,
      params.get('product')?`%${params.get('product')}%`:null,numericPage(params.get('limit'),{fallback:500,max:1000})];
    return res.json(await getMany(`SELECT * FROM supplier_imports
      WHERE ($1::text IS NULL OR destination_warehouse=$1)
        AND ($2::text IS NULL OR supplier_name ILIKE $2)
        AND ($3::text IS NULL OR product_name ILIKE $3)
      ORDER BY created_at DESC LIMIT $4`,values));
  }
  if (req.method==='POST') {
    const body=typeof req.body==='string' ? JSON.parse(req.body) : req.body || {};
    return receiveImport({...req,body:{
      receiptKey:body.receiptKey || body.receipt_key,supplierId:body.supplier_name || body.supplierName,
      grn_number:body.grn_number || body.grnNumber,invoice_number:body.invoice_number || body.invoiceNumber,
      shipment_reference:body.shipment_reference || body.shipmentReference,origin_country:body.origin_country || body.originCountry,
      notes:body.notes,metadata:body.metadata,expenses:body.expenses,
      items:[{productName:body.product_name || body.productName,productId:body.product_id || body.productId,
        quantity:body.quantity,enteredUnit:body.enteredUnit || body.entered_unit,
        unitCIF:body.cif_unit_cost ?? body.cifUnitCost,unitDP:body.dpc_unit_value ?? body.dpcUnitValue,
        batchNo:body.batch_no || body.batchNo,expiryDate:body.expiry_date || body.expiryDate}],
    }},res);
  }
  if (['PUT','PATCH','DELETE'].includes(req.method))
    return res.status(409).json({success:false,error:'Posted imports are immutable; use an approved linked correction'});
  return res.status(405).json({success:false,error:'Method not allowed'});
}
export default atomicStockRequest(handler);

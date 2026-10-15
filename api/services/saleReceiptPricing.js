const key=item=>String(item.product_name||item.productName||item.name||'').trim().toLowerCase();
export function withCapturedReceiptDP(sales,facts){
 return sales.map(sale=>{
  const items=sale.products||[],groups=new Map();
  for(const item of items){
   const name=key(item),g=groups.get(name)||{quantity:0};
   g.quantity+=Number(item.quantity||0);groups.set(name,g);
  }
  let complete=true;
  const products=items.map(item=>{
   const matched=facts.filter(f=>String(f.reference_id)===String(sale.id)&&key(f)===key(item));
   const prices=matched.map(f=>f.dp_unit_price==null||f.dp_unit_price===''?NaN:Number(f.dp_unit_price));
   const quantity=matched.reduce((sum,f)=>sum+Math.abs(Number(f.quantity)),0);
   if(!matched.length||prices.some(p=>!Number.isFinite(p)||p<0)||new Set(prices).size!==1
      ||Math.abs(quantity-groups.get(key(item)).quantity)>0.000001){complete=false;return {...item};}
   return {...item,dpPrice:prices[0],dp_price:prices[0],dp:prices[0]};
  });
  return {...sale,products,items:products,dpEvidence:complete?'captured_sale_dp':'legacy_or_incomplete_dp_evidence'};
 });
}

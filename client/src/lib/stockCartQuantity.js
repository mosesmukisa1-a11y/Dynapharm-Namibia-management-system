export function stockCartQuantity(cart,description,input){
  const qty=input===''?'':Number(input);
  return cart.map(item=>item.description===description?{...item,qty:Number.isFinite(qty)||qty===''?qty:''}:item);
}
export function validStockCart(cart){
  return cart.length>0&&cart.every(item=>Number.isInteger(Number(item.qty))&&Number(item.qty)>0);
}

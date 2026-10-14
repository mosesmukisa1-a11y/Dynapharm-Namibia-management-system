export const saleMovement = m => /sale|dispense|campaign_free_item|online_order_fulfilment/.test(m.movement_type || m.movementType || m.type || '');
export function movementDPValue(m) {
  if(saleMovement(m)) {
    const saved=m.dp_value ?? m.metadata?.sale_evidence?.dp_value;
    return saved == null ? null : Number(saved);
  }
  const unit=m.unit_dp ?? m.unit_price ?? m.unitPrice;
  return unit==null ? null : Math.abs(Number(m.quantity))*Number(unit);
}
export function movementDPUnit(m) {
  const value=movementDPValue(m),q=Math.abs(Number(m.quantity));
  return value==null || !q ? null : value/q;
}
export function namibiaDay(value=new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Windhoek',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}

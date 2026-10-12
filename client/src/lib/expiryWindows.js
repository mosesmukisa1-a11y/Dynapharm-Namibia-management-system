export const stockAsOfDate=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Africa/Windhoek',year:'numeric',month:'2-digit',day:'2-digit'
}).format(now);
export function expiryDays(expiry,asOf){
  if(!expiry)return null;
  const day=expiry instanceof Date?expiry.toISOString().slice(0,10):String(expiry).slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)))return null;
  if(new Date(day).toISOString().slice(0,10)!==day)return null;
  return Math.round((Date.parse(day)-Date.parse(asOf))/86400000);
}
export function expiryWindows(batches,asOf=stockAsOfDate()){
  const active=batches.filter(b=>Number(b.remaining_quantity ?? b.quantity ?? b.qty ?? 0)>0);
  const inWindow=days=>active.filter(b=>{const d=expiryDays(b.expiry_date ?? b.expiryDate,asOf);return d!==null && d>=0 && d<=days;});
  return {asOf,within30:inWindow(30),within90:inWindow(90),
    expired:active.filter(b=>{const d=expiryDays(b.expiry_date ?? b.expiryDate,asOf);return d!==null && d<0;}),
    missing:active.filter(b=>expiryDays(b.expiry_date ?? b.expiryDate,asOf)===null)};
}

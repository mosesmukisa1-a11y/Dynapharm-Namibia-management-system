import {datePredicatePlan} from './queryDescriptors.js';
export const BUSINESS_TIMEZONE='Africa/Windhoek';
// Date-only columns (BAT.service_date, expiry) are already business dates.
// Transaction columns use timestamptz. For legacy timestamp-without-zone
// columns, pass their documented storage zone explicitly, never session casts.
export function businessDatePredicate(column, placeholder, end=false, legacyZone=null) {
  return datePredicatePlan(column,placeholder,end,legacyZone);
}
export function businessTime(value=new Date()) {
  return new Intl.DateTimeFormat('en-GB',{timeZone:BUSINESS_TIMEZONE,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(value);
}
export function businessDay(value=new Date()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:BUSINESS_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
}
export function validateBusinessDates(from,to){
  for(const value of [from,to]){
    if(value!=null && value!=='' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value))
      throw Object.assign(Error('Use a valid calendar date (YYYY-MM-DD)'),{statusCode:422});
  }
  if(from && to && from>to)throw Object.assign(Error('From date must not be after To date'),{statusCode:422});
}

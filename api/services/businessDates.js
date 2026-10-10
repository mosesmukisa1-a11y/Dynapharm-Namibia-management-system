export const BUSINESS_TIMEZONE='Africa/Windhoek';
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

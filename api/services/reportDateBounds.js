import {businessDatePredicate,validateBusinessDates} from './businessDates.js';
import {datePredicatePlan} from './queryDescriptors.js';

// Calendar end dates include the entire Windhoek day, not UTC midnight or
// 23:59:59. Explicit instants remain exact, exclusive upper bounds.
export function reportInstantPredicate(column,placeholder,value,end=false){
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
  validateBusinessDates(value,value);
  return businessDatePredicate(column,placeholder,end);
 }
 validateBusinessDates(String(value).slice(0,10),null);
 if(!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))
  throw Object.assign(Error('Use a calendar date or an ISO instant with a timezone'),{statusCode:422});
 return datePredicatePlan(column,placeholder,end,null,true);
}

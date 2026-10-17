import {createHash} from 'node:crypto';
// Internal RI trigger names contain installation-specific catalog OIDs.
// Preserve their full semantics, normalizing only those generated digits.
export function normalizedSchema(value){
  if(Array.isArray(value))return value.map(normalizedSchema);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort()
    .filter(k=>k!=='guard').map(k=>[k,normalizedSchema(value[k])]));
  return typeof value==='string'?value.replace(/RI_ConstraintTrigger_([ac])_\d+/g,'RI_ConstraintTrigger_$1_<oid>'):value;
}
export const schemaDigest=value=>createHash('sha256').update(JSON.stringify(normalizedSchema(value))).digest('hex');

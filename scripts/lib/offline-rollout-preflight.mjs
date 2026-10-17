// Pure offline comparison. This module cannot connect, execute DDL or authorize it.
function fingerprintMap(value){
  if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return null;
  const descriptors=Object.getOwnPropertyDescriptors(value),result=Object.create(null);
  for(const key of Object.keys(descriptors)){
    const d=descriptors[key];
    if(!Object.hasOwn(d,'value')||typeof d.value!=='string'||!/^[a-f0-9]{64}$/.test(d.value))return null;
    result[key]=d.value;
  }
  return result;
}
function compare(expected,observed){
  const actual=fingerprintMap(observed),wanted=fingerprintMap(expected);
  return !!actual&&!!wanted&&Object.keys(actual).length===Object.keys(wanted).length&&
    Object.keys(wanted).every(key=>Object.hasOwn(actual,key)&&actual[key]===wanted[key]);
}
export function assessOfflinePreflight(plan,observation){
  const sourceMatch=compare(plan.sourceHashes,observation?.sourceHashes);
  const schemaMatch=compare(plan.schemaFingerprints,observation?.schemaFingerprints);
  return Object.freeze({
    sourceMatch,schemaMatch,checksPassed:sourceMatch&&schemaMatch,
    executionAllowed:false,productionAccessAuthorized:false,
    disposition:sourceMatch&&schemaMatch?'OFFLINE CONTRACT MATCH ONLY':'BLOCKED',
    reasons:Object.freeze([
      ...(!sourceMatch?['SOURCE_FINGERPRINT_MISMATCH']:[]),
      ...(!schemaMatch?['SCHEMA_FINGERPRINT_MISMATCH']:[]),
      'NO_CURRENT_TARGET_AUTHORITY_OR_BACKUP_VERIFICATION',
      'NON_EXECUTING_REVIEW_ONLY',
    ]),
  });
}

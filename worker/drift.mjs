// No repair, movement, request, price or accounting writes are available here.
import {registeredPlan,executePlan} from '../api/services/queryDescriptors.js';
// A variance is a review candidate on known exact-ID source layers, never proof
// of missing goods or permission to overwrite a cached/physical balance.
export async function detectDrift(ctx){
  for(const scope of ctx.scope){
    if(!['branch','warehouse'].includes(scope.type))throw Object.assign(Error('Invalid worker location type'),{code:'INVALID_SCOPE'});
    const location=await executePlan(ctx.read,registeredPlan(scope.type==='branch'?
      'worker/drift.mjs:branch-location':'worker/drift.mjs:warehouse-location'),[scope.id]);
    if(!location.rows.length||location.rows[0].status!=='active')throw Object.assign(Error('Invalid worker location'),{code:'INVALID_SCOPE'});
    const {rows}=await executePlan(ctx.read,registeredPlan(scope.type==='branch'?
      'worker/drift.mjs:branch-variance':'worker/drift.mjs:warehouse-variance'),
    [scope.id,scope.type]);
    for(const row of rows){
      if(!row.product_name)throw Object.assign(Error('Missing product identity'),{code:'MISSING_PRODUCT_IDENTITY'});
      await ctx.finding({...scope,...row,
      finding_type:row.known_physical_quantity===null?'missing_source':
        row.cached_quantity===null?'missing_cache':'review_variance'});
    }
  }
}

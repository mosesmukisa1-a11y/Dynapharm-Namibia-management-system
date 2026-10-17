// Importing this capability first proves the disposable target, independently
// of descriptor admission. Production code never imports this test module.
import './owned-raw-database.js';
import {registeredPlan,bindPlan} from '../../api/services/queryDescriptors.js';
export function ownedStatement(id,values=[]){
  if(typeof id!=='string'||!id.startsWith('owned-tests/'))throw Error('Invalid owned fixture query');
  return bindPlan(registeredPlan(id),values);
}

import {getOne} from '../db.js';
export async function memberEligibility(user){
 if(!user)return {eligible:false,reason:'Staff or member login required'};
 // Values come only from the authenticated user, never the checkout payload.
 const code=String(user.distributor_code || user.nb_number || user.username || '').trim().toUpperCase();
 if(!code)return {eligible:false,reason:'No linked membership'};
 const member=await getOne(`SELECT d.id,d.distributor_code FROM distributors d
   WHERE UPPER(TRIM(d.distributor_code))=$1 AND d.status='active'
   AND EXISTS(SELECT 1 FROM distributor_agreements a WHERE UPPER(TRIM(a.nb_number))=$1 AND a.status='approved')
   LIMIT 1`,[code]);
 return member?{eligible:true,code:member.distributor_code,memberId:member.id}:
  {eligible:false,reason:'No approved active membership linked to this login'};
}
export async function requireMemberWrite(user,requestedCode){
 const result=await memberEligibility(user);
 if(!result.eligible || String(requestedCode || '').toUpperCase()!==String(result.code || '').toUpperCase()){
  const error=new Error(result.reason || 'Membership does not belong to this login');error.statusCode=403;throw error;
 }
 return result;
}

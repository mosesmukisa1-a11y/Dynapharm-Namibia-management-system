import {memberEligibility} from './services/memberEligibility.js';
export default async function handler(req,res){
 if(!req.user)return res.status(401).json({error:'Authentication required'});
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 try{return res.json(await memberEligibility(req.user));}
 catch(error){return res.status(503).json({eligible:false,error:'Membership verification unavailable'});}
}

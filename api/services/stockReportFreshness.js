const readers=new Set(['admin','super_admin','superadmin','gm','general_manager','director','finance','finance_manager','mis','stock','stock_manager']);
export const canReadCompanyStock=user=>!!user&&readers.has(String(user.role||'').toLowerCase());
export const canReadCentralBatches=user=>canReadCompanyStock(user)||['warehouse','warehouse_manager'].includes(String(user?.role||'').toLowerCase());
export function storedFreshness(value){
  const date=value?new Date(value):null;
  if(!date||!Number.isFinite(date.getTime()))return {state:'unavailable',generatedAt:null,reason:'Missing or invalid generation timestamp'};
  return {state:'last-generated',generatedAt:date.toISOString(),timezone:'Africa/Windhoek',
    isLive:false,message:'Stored summary only; this is not a current live stock balance.'};
}
export function liveFreshness(){
  return {state:'live',retrievedAt:new Date().toISOString(),timezone:'Africa/Windhoek',isLive:true};
}

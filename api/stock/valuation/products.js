import valuation from '../valuation.js';
export default function handler(req,res) {
  const search=new URL(req.url,'http://internal').searchParams.get('search')?.toLowerCase() || '';
  return valuation(req,{status(code){res.status(code);return this;},
    json(body){return res.json(body.success ? {success:true,products:body.products.filter(p=>p.productName.toLowerCase().includes(search)),summary:body.summary} : body);}});
}

import valuation from '../valuation.js';
export default function handler(req,res) {
  return valuation(req,{status(code){res.status(code);return this;},
    json(body){return res.json(body.success ? {success:true,locations:body.locations,summary:body.summary} : body);}});
}

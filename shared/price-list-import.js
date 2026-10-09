// Shared, conservative product identity and extraction rules. Numbers in names
// (particularly pack sizes) are never discarded by name matching.
export function businessToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Africa/Windhoek',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(k => parts.find(p => p.type===k).value).join('-');
}
export function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}
export function splitCode(value) {
  const text=String(value || '').trim();
  const match=text.match(/^([A-Z]{1,3}\d{4,6}[A-Z]?)\s+(.+)$/i);
  return match ? {code:normalizeCode(match[1]),name:match[2]} : {code:'',name:text};
}
export function nameKey(value) {
  return splitCode(value).name.toUpperCase().replace(/[‘’`]/g,"'").replace(/[()]/g,' ')
    .replace(/(\d|'S)\s*[xX×]\s*(?=\d)/g,'$1 X ').replace(/\s+/g,' ').trim();
}
export function parsePriceNumber(value) {
  let text=String(value ?? '').trim();
  if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(text)) text=text.replace(/,/g,'');
  else if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(text)) text=text.replace(/\./g,'').replace(',','.');
  else text=text.replace(',','.');
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
}
function csvFields(line, separator) {
  const fields=[]; let current='',quoted=false;
  for(let i=0;i<line.length;i++) {
    const c=line[i];
    if(c==='"') {if(quoted && line[i+1]==='"'){current+='"';i++;}else quoted=!quoted;}
    else if(c===separator && !quoted){fields.push(current.trim());current='';}
    else current+=c;
  }
  fields.push(current.trim());
  return quoted ? null : fields;
}
export function parsePriceListText(text, {layout='auto'}={}) {
  const products=[],errors=[],duplicates=[];
  let columns=null, delimiter=null, inferredLayout=layout;
  for(const [index,raw] of String(text || '').split(/\r?\n/).entries()) {
    const rowNumber=index+1, line=raw.trim();
    if(!line) continue;
    const header=line.toUpperCase();
    if(/\bDP\b/.test(header) && /\bCP\b/.test(header)) {
      delimiter=line.includes(';')?';':line.includes(',')?',':line.includes('\t')?'\t':null;
      const labels=(delimiter?csvFields(line,delimiter):line.split(/\s+/)) || [];
      columns=labels.map(v=>v.toUpperCase().replace(/[^A-Z]/g,''));
      if(columns.includes('CIF') && columns.some(c=>['BV','BVS'].includes(c))) inferredLayout='cif-dp-cp-bv';
      else if(columns.includes('CIF')) inferredLayout='cif-dp-cp';
      else if(columns.some(c=>['BV','BVS'].includes(c))) inferredLayout='dp-cp-bv';
      continue;
    }
    let description,code='',values={},selected=inferredLayout;
    if(delimiter && columns) {
      const fields=csvFields(line,delimiter);
      if(!fields || fields.length!==columns.length){errors.push({rowNumber,message:'Column count does not match the header.'});continue;}
      const get=(...keys)=>fields[columns.findIndex(c=>keys.includes(c))];
      description=get('DESCRIPTION','PRODUCT','PRODUCTNAME','NAME');
      code=get('CODE','PRODUCTCODE','SKU') || '';
      for(const key of ['cif','dp','cp','bv']) {
        const source=get(key.toUpperCase(),key==='bv'?'BVS':key.toUpperCase());
        if(source!==undefined) values[key]=parsePriceNumber(source);
      }
    } else {
      const tokens=line.split(/\s+/);
      let count=0;
      while(count<tokens.length && Number.isFinite(parsePriceNumber(tokens[tokens.length-1-count]))) count++;
      const coded=splitCode(line).code;
      if(!count) {
        if(coded) errors.push({rowNumber,message:'Missing or malformed numeric price columns.'});
        continue;
      }
      if(selected==='auto') {
        if(count===4) selected='cif-dp-cp-bv';
        else {errors.push({rowNumber,message:'Choose the column layout or include a CIF/DP/CP/BV header; this row is ambiguous.'});continue;}
      }
      const keys=selected==='cif-dp-cp-bv'?['cif','dp','cp','bv']:selected==='cif-dp-cp'?['cif','dp','cp']:['dp','cp','bv'];
      if(count<keys.length){errors.push({rowNumber,message:'Missing or malformed price columns.'});continue;}
      description=tokens.slice(0,-keys.length).join(' ');
      if(columns?.some(c=>['CODE','PRODUCTCODE','SKU'].includes(c))) {
        code=tokens[0];
        description=tokens.slice(1,-keys.length).join(' ');
      }
      const split=splitCode(description); code=code || split.code; description=split.name;
      if(count>keys.length) {errors.push({rowNumber,message:'Numeric name/price boundary is ambiguous. Use a delimited file with a header.'});continue;}
      keys.forEach((key,i)=>values[key]=parsePriceNumber(tokens[tokens.length-keys.length+i]));
    }
    const split=splitCode(description);
    if(code && split.code && normalizeCode(code)!==split.code){errors.push({rowNumber,message:'Product code columns disagree.'});continue;}
    code=normalizeCode(code || split.code);
    description=split.name.toUpperCase().replace(/\s+/g,' ').trim();
    if(!description || !Number.isFinite(values.dp) || values.dp<=0 || !Number.isFinite(values.cp) || values.cp<=0 ||
      Object.values(values).some(v=>!Number.isFinite(v)||v<0)) {
      errors.push({rowNumber,message:'A product name, positive DP/CP and valid non-negative price columns are required.'});continue;
    }
    const product={description,product_code:code || null,...values,rowNumber};
    const identity=code || nameKey(description);
    if(products.some(p=>(p.product_code || nameKey(p.description))===identity)) duplicates.push({rowNumber,description});
    products.push(product); // Keep repeats: the server distinguishes harmless repeats from conflicts.
  }
  return {products,errors,duplicates};
}
export function resolveProduct(product,catalogue) {
  const code=normalizeCode(product.product_code || splitCode(product.description).code);
  const key=nameKey(product.description);
  const active=catalogue.filter(p=>!p.merged_into_id);
  const coded=code ? active.filter(p=>normalizeCode(p.product_code || splitCode(p.description).code)===code) : [];
  const named=active.filter(p=>nameKey(p.description)===key);
  if(coded.length>1) return {conflict:'More than one catalogue entry has this code.'};
  if(coded.length===1) {
    const oldNumbers=nameKey(coded[0].description).match(/\d+(?:[.,]\d+)?/g) || [];
    const newNumbers=key.match(/\d+(?:[.,]\d+)?/g) || [];
    if(oldNumbers.length && newNumbers.length && oldNumbers.join('|')!==newNumbers.join('|'))
      return {conflict:'The code matches but pack size/strength numbers disagree.'};
    if(named.some(p=>p.id!==coded[0].id && normalizeCode(p.product_code) && normalizeCode(p.product_code)!==code))
      return {conflict:'Code and name identify different products.'};
    return {existing:coded[0]};
  }
  const compatible=named.filter(p=>!code || !normalizeCode(p.product_code || splitCode(p.description).code) || normalizeCode(p.product_code || splitCode(p.description).code)===code);
  if(compatible.length>1) return {conflict:'Multiple catalogue entries match. Review duplicates first.'};
  if(compatible.length===1) return {existing:compatible[0]};
  if(named.length) return {conflict:'The name exists with a different product code; no automatic merge is allowed.'};
  return {existing:null};
}

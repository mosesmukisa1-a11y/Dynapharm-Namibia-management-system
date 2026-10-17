// Error responses are diagnostics, not a channel for echoing request data,
// database messages, filesystem paths or third-party errors.
const messages=Object.freeze({
  400:'Request validation failed.',401:'Authentication required.',
  403:'Access denied.',404:'Resource not found.',405:'Method not allowed.',
  409:'Operation conflict. Refresh and retry.',413:'Request too large.',
  422:'Request validation failed.',429:'Too many requests.',
  500:'Operation failed; please try again.',503:'Service temporarily unavailable.',
});
export function publicFailure(status,body){
  const result={success:false,error:messages[status]||'Request could not be completed.'};
  if(['PASSWORD_CHANGE_REQUIRED','CONNECTION_LOST','FILE_TOO_LARGE'].includes(body?.code))
    result.code=body.code;
  // Preserve the public health protocol, but never its schema-object details.
  if(body?.startup&&typeof body.startup==='object'){
    const s=body.startup;
    if(['code-only','legacy'].includes(s.startupMode)){
      result.startup={startupMode:s.startupMode};
      for(const key of ['compatible','writesAllowed','schedulerEnabled'])
        if(typeof s[key]==='boolean'||(key==='compatible'&&s[key]===null))result.startup[key]=s[key];
    }
  }
  return result;
}
export function errorOutputBoundary(req,res,next){
  const json=res.json.bind(res),send=res.send.bind(res),end=res.end.bind(res),write=res.write.bind(res);
  let emitting=false,emitted=false;
  const failed=body=>res.statusCode>=400||
    (body&&typeof body==='object'&&!Buffer.isBuffer(body)&&(body.success===false||
      (Object.hasOwn(body,'error')&&Boolean(body.error))));
  function output(body){
    emitting=true;
    // Do not retain diagnostic headers chosen by a failing downstream component.
    for(const name of res.getHeaderNames()){
      if(!/^(?:access-control-|vary$|set-cookie$|www-authenticate$|retry-after$|allow$|content-security-policy$|strict-transport-security$|x-content-type-options$|x-frame-options$|referrer-policy$|cross-origin-|permissions-policy$|cache-control$|pragma$|expires$)/i.test(name))
        res.removeHeader(name);
    }
    try{return json(publicFailure(res.statusCode,body));}finally{emitting=false;emitted=true;}
  }
  res.json=body=>emitted?res:!emitting&&failed(body)?output(body):json(body);
  res.send=body=>emitted?res:!emitting&&failed(body)?output(body):send(body);
  res.end=(...args)=>emitted?res:!emitting&&!res.headersSent&&failed(null)?output():end(...args);
  res.write=(...args)=>{
    if(emitted)return false;
    if(!emitting&&!res.headersSent&&failed(null)){output();return false;}
    return write(...args);
  };
  next();
}

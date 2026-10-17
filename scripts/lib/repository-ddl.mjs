// PostgreSQL lexical statement splitting: quoted semicolons are not separators.
// Used only on checked-in schema sources, never HTTP input or database dumps.
export function splitPostgresStatements(text){
  let start=0,quote=null,dollar=null,lineComment=false,blockDepth=0;
  const statements=[];
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(lineComment){if(ch==='\n')lineComment=false;continue;}
    if(blockDepth){if(ch==='/'&&next==='*'){blockDepth++;i++;}
      else if(ch==='*'&&next==='/'){blockDepth--;i++;}continue;}
    if(dollar){if(text.startsWith(dollar,i)){i+=dollar.length-1;dollar=null;}continue;}
    if(quote){if(ch===quote){if(next===quote)i++;else quote=null;}
      else if(ch==='\\'&&quote==="'")i++;continue;}
    if(ch==='-'&&next==='-'){lineComment=true;i++;continue;}
    if(ch==='/'&&next==='*'){blockDepth=1;i++;continue;}
    if(ch==="'"||ch==='"'){quote=ch;continue;}
    if(ch==='$'){
      const tag=text.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
      if(tag){dollar=tag;i+=tag.length-1;continue;}
    }
    if(ch===';'){statements.push(text.slice(start,i+1));start=i+1;}
  }
  if(quote||dollar||blockDepth)throw Error('Unterminated repository SQL');
  if(text.slice(start).trim())statements.push(text.slice(start));
  return statements;
}
export function repositoryDdlStatements(text){
  return splitPostgresStatements(text).filter(sql=>{
    const head=sql.replace(/^\s*(?:(?:--[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/))\s*/g,'').trimStart();
    return /^(?:CREATE\s+(?:(?:OR\s+REPLACE|UNIQUE)\s+)?(?:TABLE|INDEX|FUNCTION|TRIGGER|VIEW)\b|ALTER\s+TABLE\b|DROP\s+TRIGGER\b|COMMENT\s+ON\b)/i.test(head);
  });
}

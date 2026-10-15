const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Windhoek',year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function windhoekParts(now=new Date()){
  const p=Object.fromEntries(formatter.formatToParts(now).map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour),minute:Number(p.minute),
    display:`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} Africa/Windhoek`};
}
export function dueSlot(task,now=new Date()){
  const p=windhoekParts(now);
  return task==='drift-detection'&&p.hour===1&&p.minute===0?p.date:null;
}
export function workerEvent(event,now=new Date()){
  return {...event,timestampUtc:now.toISOString(),timestampWindhoek:windhoekParts(now).display};
}

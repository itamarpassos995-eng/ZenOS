const parts=(at,timeZone)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
function midnight(year,month,day,timeZone){
 const target=Date.UTC(year,month-1,day);let at=target;
 for(let i=0;i<4;i++){const p=parts(at,timeZone),local=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second),delta=target-local;if(delta===0)return at;at+=delta;}
 return at;
}
export function distributionPeriod(period='hoje',now=Date.now(),timeZone='America/Asuncion',from='',to=''){
 const p=parts(now,timeZone);let start=new Date(Date.UTC(p.year,p.month-1,p.day)),end=new Date(+start+86400000);
 if(period==='mes'){start=new Date(Date.UTC(p.year,p.month-1,1));end=new Date(Date.UTC(p.year,p.month,1));}
 if(period==='anterior'){start=new Date(Date.UTC(p.year,p.month-2,1));end=new Date(Date.UTC(p.year,p.month-1,1));}
 if(period==='personalizado'){
  const parse=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('INVALID_PERIOD');const d=new Date(s+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==s)throw Error('INVALID_PERIOD');return d;};
  start=parse(from);end=new Date(+parse(to)+86400000);
 }
 if(end<=start||end-start>366*86400000)throw Error('INVALID_PERIOD');
 const convert=d=>midnight(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate(),timeZone);
 return {inicio:new Date(convert(start)).toISOString(),fim:new Date(convert(end)).toISOString()};
}

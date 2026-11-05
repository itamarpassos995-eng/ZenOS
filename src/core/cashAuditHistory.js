export function intervaloCaixa(periodo, agora=new Date(), inicio='',fim='') {
 const start=new Date(agora.getFullYear(),agora.getMonth(),agora.getDate());
 let end=new Date(start);end.setDate(end.getDate()+1);
 if(periodo==='mes'){start.setDate(1);end=new Date(start.getFullYear(),start.getMonth()+1,1);}
 if(periodo==='anterior'){end=new Date(start.getFullYear(),start.getMonth(),1);start.setMonth(start.getMonth()-1,1);}
 if(periodo==='personalizado'){
  const parse=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return new Date(NaN);const [y,m,d]=s.split('-').map(Number);const value=new Date(y,m-1,d);return value.getFullYear()===y&&value.getMonth()===m-1&&value.getDate()===d?value:new Date(NaN);};
  const from=parse(inicio),to=parse(fim);to.setDate(to.getDate()+1);
  if(!Number.isFinite(+from)||!Number.isFinite(+to)||from>=to)throw Error('Informe um período válido.');
  return {inicio:from.toISOString(),fim:to.toISOString()};
 }
 return {inicio:start.toISOString(),fim:end.toISOString()};
}
export function filtrarTurnosCaixa(sessoes,intervalo){
 return sessoes.filter(s=>{const t=Date.parse(s.createdAt||s.fechamento);return t>=Date.parse(intervalo.inicio)&&t<Date.parse(intervalo.fim);});
}
export function diferencaHistoricaCaixa(s){
 if(s.status!=='fechada')return {pendente:false,valor:null};
 const invalido=v=>v==null||v===''||!Number.isFinite(Number(v));
 const pendente=s.situacaoConciliacao==='PENDENTE_AUDITORIA'||(s.pendenciasConciliacao||[]).length>0||invalido(s.diferenca)||invalido(s.saldoInformado)||invalido(s.saldoSistema)
  || Math.abs((Number(s.saldoInformado)-Number(s.saldoSistema))-Number(s.diferenca))>0.021;
 return {pendente,valor:pendente?null:Number(s.diferenca)};
}

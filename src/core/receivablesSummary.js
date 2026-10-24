// Consultas ao financeiro devem ser sob demanda. Este resumo usa somente
// dados operacionais já sincronizados, sem inventar parcelas ou vencimentos.
const centavos = v => { const n=Number(v); return Number.isFinite(n)?Math.round(n*100):0; };
const dinheiro = c => Math.round(c)/100;
export function periodoValido(inicio,fim,maxDias=120) {
 const numero=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||'')))return null;
  const [a,m,d]=s.split('-').map(Number),n=Date.UTC(a,m-1,d);
  return new Date(n).toISOString().slice(0,10)===s?n:null;};
 const a=numero(inicio),b=numero(fim);
 return a!==null&&b!==null&&a<=b&&Math.floor((b-a)/86400000)+1<=maxDias;
}
export function resumirRecebiveis({clientes=[],historicoVendas=[],inicio,fim}={}) {
 if(!periodoValido(inicio,fim))throw new Error('Período inválido: máximo de 120 dias.');
 const abertos=(clientes||[]).filter(c=>c&&centavos(c.saldoDevedorBRL)>0)
  .map(c=>({id:String(c.id),nome:String(c.nome||'Cliente'),saldo:dinheiro(centavos(c.saldoDevedorBRL))}))
  .sort((a,b)=>b.saldo-a.saldo||a.nome.localeCompare(b.nome));
 const vendas=(historicoVendas||[]).filter(v=>v&&v.tipoDocumento==='venda'&&v.estado==='concluida'
  &&typeof v.createdAt==='string'&&v.createdAt.slice(0,10)>=inicio&&v.createdAt.slice(0,10)<=fim
  &&Array.isArray(v.pagamentos)&&v.pagamentos.some(p=>p?.formaId==='crediario'&&centavos(p.valorConvertidoBRL)>0))
  .map(v=>({id:String(v.id),clienteId:v.clienteId==null?null:String(v.clienteId),
   nome:String(v.clienteNome||'Sem nome'),data:v.createdAt.slice(0,10),
   valor:dinheiro(v.pagamentos.filter(p=>p?.formaId==='crediario')
     .reduce((s,p)=>s+centavos(p.valorConvertidoBRL),0))}))
  .sort((a,b)=>b.data.localeCompare(a.data)||b.id.localeCompare(a.id));
 return {abertos,vendas,totalAberto:dinheiro(abertos.reduce((s,c)=>s+centavos(c.saldo),0)),
  totalVendido:dinheiro(vendas.reduce((s,v)=>s+centavos(v.valor),0)),
  quantidadeDevedores:abertos.length,parcelasComVencimentoCertificadas:false};
}

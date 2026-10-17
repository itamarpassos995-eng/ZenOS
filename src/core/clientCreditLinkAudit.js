// Diagnóstico P0 apenas de leitura: não grava, reconcilia, remove nem altera contas.
// Compatível com IDs históricos numéricos e em texto. Divergência de nome pode ser
// renomeação legítima e NUNCA autoriza transferência financeira automática.
const id = value => value === null || value === undefined ? '' : String(value).trim();
const nome = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
const cents = value => {
  const n=Number(value);
  return Number.isFinite(n)?Math.round(n*100):null;
};
const INICIO_INCIDENTE=Date.parse('2026-10-16T00:00:00.000Z');

export function auditarVinculosFiado({clientes=[],historicoVendas=[],livroFinanceiro=[]}={}){
  if(!Array.isArray(clientes)||!Array.isArray(historicoVendas)||!Array.isArray(livroFinanceiro))return [];
  const cadastros=new Map(),porVenda=new Map();
  for(const c of clientes) {
    const key=id(c?.id);
    if(!key)continue;
    if(!cadastros.has(key))cadastros.set(key,[]);
    cadastros.get(key).push(c);
  }
  for(const l of livroFinanceiro){
    if(l?.tipo!=='venda_fiada'||!id(l.referenciaId))continue;
    const key=id(l.referenciaId);
    if(!porVenda.has(key))porVenda.set(key,[]);
    porVenda.get(key).push(l);
  }
  const saida=[];
  for(const venda of historicoVendas){
    if(venda?.tipoDocumento!=='venda'||venda?.estado!=='concluida'
      ||!(Date.parse(venda.createdAt||'')>=INICIO_INCIDENTE))continue;
    const pagos=Array.isArray(venda.pagamentos)?venda.pagamentos.filter(p=>p?.formaId==='crediario'):[];
    if(!pagos.length)continue;
    const valor=pagos.reduce((s,p)=>s+(cents(p.valorConvertidoBRL)||0),0);
    const ident=id(venda.clienteId);
    const encontrados=cadastros.get(ident)||[];
    const atual=encontrados.length===1?encontrados[0]:null;
    const lancamentos=porVenda.get(id(venda.id))||[];
    const l=lancamentos.length===1?lancamentos[0]:null;
    const problemas=[];
    if(!ident)problemas.push('Venda fiada sem ID de cliente');
    else if(!encontrados.length)problemas.push('ID da venda não encontrado em Clientes');
    else if(encontrados.length!==1)problemas.push('ID da venda duplicado em Clientes');
    if(atual&&nome(venda.clienteNome)!==nome(atual.nome))
      problemas.push('Nome da venda diferente do cadastro atual (pode ter sido renomeado)');
    if(lancamentos.length===0)problemas.push('Lançamento do fiado ausente no Livro Financeiro');
    if(lancamentos.length>1)problemas.push('Mais de um lançamento fiado para a mesma venda');
    if(l){
      if(id(l.clienteId)!==ident)problemas.push('ID do lançamento financeiro diferente do ID da venda');
      if(nome(l.clienteNome)!==nome(venda.clienteNome))
        problemas.push('Nome no lançamento financeiro diferente do nome na venda');
      if(cents(l.valor)!==valor)problemas.push('Valor do lançamento financeiro difere da parcela fiada');
    }
    if(problemas.length)saida.push({
      vendaId:id(venda.id),vendaNome:String(venda.clienteNome||''),
      clienteIdVenda:ident,clienteAtualNome:atual?.nome||'Não localizado',
      clienteIdFinanceiro:l?id(l.clienteId):'Não localizado',
      clienteNomeFinanceiro:l?.clienteNome||'Não localizado',
      valorFiadoBRL:valor/100,problemas,
    });
  }
  return saida.sort((a,b)=>String(b.vendaId).localeCompare(String(a.vendaId)));
}

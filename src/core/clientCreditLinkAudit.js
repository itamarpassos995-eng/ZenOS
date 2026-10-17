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
      problemas.push('Nome histórico da venda diferente do nome atual (informativo; ID é a referência)');
    if(lancamentos.length===0)problemas.push('Lançamento do fiado ausente no Livro Financeiro');
    if(lancamentos.length>1)problemas.push('Mais de um lançamento fiado para a mesma venda');
    if(l){
      if(id(l.clienteId)!==ident)problemas.push('ID do lançamento financeiro diferente do ID da venda');
      if(nome(l.clienteNome)!==nome(venda.clienteNome))
        problemas.push('Nome histórico no financeiro diferente do comprovante (conferir; não altera IDs)');
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

/**
 * Bloqueio excepcional de recebimento por prova de conflito de IDs, e NÃO
 * por nomes legados, que continuam válidos após renomeação de um cliente.
 * A lista é diagnóstica: não realiza operação financeira.
 */
export function encontrarConflitosIdsRecebimento({
  clienteId, historicoVendas=[], livroFinanceiro=[],
}={}){
  const key=id(clienteId);
  if(!key||!Array.isArray(historicoVendas)||!Array.isArray(livroFinanceiro))return [];
  const vendasPorId=new Map();
  for(const v of historicoVendas){
    const k=id(v?.id);
    if(!k)continue;
    if(!vendasPorId.has(k))vendasPorId.set(k,[]);
    vendasPorId.get(k).push(v);
  }
  const conflitos=[];
  for(const lanc of livroFinanceiro){
    if(lanc?.tipo!=='venda_fiada'||id(lanc.clienteId)!==key
      ||!(Date.parse(lanc.createdAt||'')>=INICIO_INCIDENTE))continue;
    const encontrados=vendasPorId.get(id(lanc.referenciaId))||[];
    // Histórico anterior ao extrato ou venda removida requer investigação,
    // mas não implica automaticamente um segundo titular.
    if(encontrados.length!==1)continue;
    const sale=encontrados[0],saleId=id(sale.clienteId);
    if(saleId && saleId!==key){
      conflitos.push({
        vendaId:id(sale.id),clienteIdVenda:saleId,
        clienteIdFinanceiro:key,
      });
    }
  }
  return conflitos;
}

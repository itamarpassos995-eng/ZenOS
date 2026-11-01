import { obterFinanceiroVenda, calcularCmvVenda, calcularCustoDevolvidoPelosItens } from './salesFinancials.js';

const centavos = valor => Math.round(Number(valor) * 100);
const numero = valor => valor !== null && valor !== undefined && valor !== '' && Number.isFinite(Number(valor));
const tolerancia = (a,b) => Math.abs(centavos(a)-centavos(b)) <= 1;
const status = pendencias => pendencias.some(p=>p.nivel==='DIVERGENTE') ? 'DIVERGENTE' : pendencias.length ? 'PENDENTE_AUDITORIA' : 'CONSISTENTE';

/** Somente leitura: nunca reescreve a venda nem presume que custo ausente é zero. */
export function auditarFinanceiroVenda(venda = {}) {
  const pendencias = [];
  const add = (codigo,nivel,detalhe) => pendencias.push({codigo,nivel,detalhe});
  const itens = Array.isArray(venda.itens) ? venda.itens : [];
  const fin = obterFinanceiroVenda(venda);
  if (!numero(venda.totalBRL) || Number(venda.totalBRL) < 0) add('TOTAL_SEM_EVIDENCIA','PENDENTE_AUDITORIA','Total da venda não é numérico ou está ausente');
  if (!itens.length) add('ITENS_SEM_EVIDENCIA','PENDENTE_AUDITORIA','Itens da venda indisponíveis para revisão de CMV');
  for (const [i,item] of itens.entries()) {
    const qtd = Number(item?.qtd);
    const devolvida = Number(item?.qtdDevolvida || 0);
    if (!Number.isFinite(qtd) || qtd < 0 || !Number.isFinite(devolvida) || devolvida < 0 || devolvida > qtd) {
      add('QUANTIDADE_INVALIDA','DIVERGENTE',`Item ${i}: quantidade/devolução inválida`);
    }
    if (!numero(item?.custoNaVendaBRL) && !numero(item?.custoBRL)) {
      add('CUSTO_SEM_EVIDENCIA','PENDENTE_AUDITORIA',`Item ${i}: custo histórico indisponível`);
    }
  }
  const custosComprovados = itens.length > 0 && itens.every(it => numero(it?.custoNaVendaBRL) || numero(it?.custoBRL));
  if (custosComprovados) {
    const cmvItens = calcularCmvVenda(venda);
    if (numero(venda.cmvBRL) && !tolerancia(venda.cmvBRL,cmvItens)) add('CMV_DIVERGENTE','DIVERGENTE','CMV gravado difere da soma dos snapshots dos itens');
    const custoDevolvido = calcularCustoDevolvidoPelosItens(venda);
    if (numero(venda.custoDevolvidoBRL) && !tolerancia(venda.custoDevolvidoBRL,custoDevolvido)) add('CUSTO_DEVOLUCAO_DIVERGENTE','DIVERGENTE','Custo devolvido difere dos itens');
    if (numero(venda.cmvBRL) && numero(venda.custoDevolvidoBRL) && numero(venda.lucroLiquidoBRL) && numero(venda.totalLiquidoBRL)) {
      const resultado = Number(venda.totalLiquidoBRL) - (Number(venda.cmvBRL)-Number(venda.custoDevolvidoBRL));
      if (!tolerancia(resultado,venda.lucroLiquidoBRL)) add('LUCRO_DIVERGENTE','DIVERGENTE','Lucro líquido gravado não fecha com receita líquida e CMV');
    }
  }
  if (numero(venda.valorDevolvidoBRL) && numero(venda.totalBRL) && Number(venda.valorDevolvidoBRL)>Number(venda.totalBRL)+.01) add('DEVOLUCAO_EXCESSIVA','DIVERGENTE','Devolução maior que a venda');
  if (numero(venda.totalLiquidoBRL) && numero(venda.totalBRL) && numero(venda.valorDevolvidoBRL) && !tolerancia(Number(venda.totalBRL)-Number(venda.valorDevolvidoBRL),venda.totalLiquidoBRL)) add('RECEITA_LIQUIDA_DIVERGENTE','DIVERGENTE','Receita líquida não fecha com devoluções');
  return {vendaId:String(venda.id ?? ''),situacao:status(pendencias),pendencias,indicadoresAtuais:{...fin}};
}

/** Auditoria apenas dos registros já fornecidos; sem acesso a rede/Firestore. */
export function auditarPeriodoFinanceiro({lojaId, vendas=[], inicio, fim}={}) {
  if (!lojaId || !inicio || !fim || !Number.isFinite(Date.parse(inicio)) || !Number.isFinite(Date.parse(fim)) || Date.parse(inicio)>Date.parse(fim)) throw new Error('Loja e período válidos são obrigatórios');
  const lista = vendas.filter(v => {
    const data = Date.parse(v.createdAt || '');
    return Number.isFinite(data) && data>=Date.parse(inicio) && data<=Date.parse(fim);
  });
  const resultados = lista.map(auditarFinanceiroVenda);
  return {lojaId:String(lojaId),inicio,fim,totalRegistros:resultados.length,
    consistentes:resultados.filter(x=>x.situacao==='CONSISTENTE').length,
    divergentes:resultados.filter(x=>x.situacao==='DIVERGENTE').length,
    pendentes:resultados.filter(x=>x.situacao==='PENDENTE_AUDITORIA').length,
    resultados};
}

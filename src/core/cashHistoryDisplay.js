import { MOEDAS_CAIXA } from './cashMoneyInput.js';

/** Somente leitura: nunca reconstituir quantias nativas a partir de valores convertidos. */
export function obterComposicaoHistoricaCaixa(movimento) {
  const nativos = movimento?.detalhesMoedasNativas;
  if (!nativos || typeof nativos !== 'object') return { comprovada:false, moedas:[], motivo:'SEM_COMPOSICAO_NATIVA' };
  const moedas = [];
  for (const moeda of MOEDAS_CAIXA) {
    const v = nativos[moeda];
    if (v == null || v === '') continue;
    const valor=Number(v);
    const fator=moeda === 'PYG' ? 1 : 100;
    if (!Number.isFinite(valor) || valor < 0 || !Number.isSafeInteger(Math.round(valor*fator))
      || Math.abs(valor*fator - Math.round(valor*fator)) > 1e-6) {
      return {comprovada:false,moedas:[],motivo:'VALOR_NATIVO_INVALIDO'};
    }
    if (valor > 0) moedas.push({moeda,valor});
  }
  if (!moedas.length) return {comprovada:false,moedas:[],motivo:'SEM_QUANTIA_NATIVA'};
  const equivalente = Number(movimento?.valorBRL);
  const taxas = movimento?.taxasCambioMovimento || null;
  return {comprovada:true,moedas, equivalenteBRL:Number.isFinite(equivalente) ? equivalente:null,
    taxas, moedaEquivalente:String(movimento?.moedaEquivalente || 'BRL')};
}

export function formatarDinheiroNativo(valor, moeda, idioma='pt') {
  const local=idioma==='es' ? 'es-PY' : idioma==='en' ? 'en-US' : 'pt-BR';
  const casas=moeda==='PYG'?0:2;
  return moeda+' '+Number(valor).toLocaleString(local,{minimumFractionDigits:casas,maximumFractionDigits:casas});
}

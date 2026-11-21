import { interpretarValorMonetario } from './cashMoneyInput.js';
import { parseMoney,formatMoneyMinor,convertMinorDirect } from './nativeMoneyKernel.js';
const fields=['custoBRL','precoBRL','preco2BRL','preco3BRL'];
export function produtoParaFormularioMonetario(produto, moeda, converterDeBRL) {
  const moedaCusto=quantiaOriginalProduto(produto,'custoBRL')?.moeda||moeda;
  const moedaPreco=quantiaOriginalProduto(produto,'precoBRL')?.moeda||moeda;
  return {...Object.fromEntries(fields.map(field=>{
    const original=quantiaOriginalProduto(produto,field);
    const codigo=field==='custoBRL'?moedaCusto:moedaPreco;
    const valor=original?(original.moeda===codigo?original.valor:original.valor*converterDeBRL(1,codigo)/converterDeBRL(1,original.moeda)):converterDeBRL(Number(produto[field]||0),codigo);
    return [field,Number(valor).toFixed(codigo==='PYG'?0:2)];
  })),moedaCusto,moedaPreco};
}
export function valoresProdutoParaBRL(form,moeda,converterParaBRL) {
  const result={};
  for(const field of fields){
    const parsed=interpretarValorMonetario(form[field],moedaCampo(form,field,moeda),{permitirVazio:true});
    if(!parsed.ok)throw Error(field+': '+parsed.erro);
    const value=Number(converterParaBRL(parsed.valor,moedaCampo(form,field,moeda)));
    if(!Number.isFinite(value)||value<0)throw Error('Cotação inválida.');
    result[field]=value;
  }
  if(!(result.precoBRL>0))throw Error('Informe um preço maior que zero.');
  return result;
}

export const CAMPOS_MONETARIOS_PRODUTO=Object.freeze(['custoBRL','precoBRL','preco2BRL','preco3BRL']);
const moedaCampo=(form,field,padrao)=>field==='custoBRL'?(form.moedaCusto||padrao):(form.moedaPreco||padrao);
export function quantiaOriginalProduto(produto,field){
 if(produto?.valoresMonetarios&&produto.valoresMonetarios.versao!==1)throw Error('Versão monetária não suportada.');
 const entry=produto?.valoresMonetarios?.campos?.[field];
 if(!entry)return null; // Legado: não inferir moeda a partir da preferência atual.
 const parsed=interpretarValorMonetario(entry.valor,entry.moeda);
 if(!parsed.ok)throw Error('Quantia original inválida: '+field);
 return {valor:parsed.valor,moeda:String(entry.moeda).toUpperCase()};
}
export function valorProdutoBRL(produto,field,converterParaBRL=v=>v){
 const original=quantiaOriginalProduto(produto,field);
 if(!original)return Number(produto?.[field]??(field==='precoBRL'?(produto?.preco??produto?.precoVenda??produto?.precoUnitario):field==='custoBRL'?produto?.custo:0)??0);
 const valor=Number(converterParaBRL(original.valor,original.moeda));
 if(!Number.isFinite(valor)||valor<0)throw Error('Cotação indisponível para '+original.moeda);
 return valor;
}
/**
 * Read-only catalog display. A verified native price wins over all FX
 * projections when the operator is viewing that SAME currency.
 * Legacy BRL-only records cannot be silently assumed to have PYG origins.
 */
export function precoExibicaoProduto(produto,field,moedaExibida,converterParaBRL,converterDeBRL){
 const original=quantiaOriginalProduto(produto,field);
 if(original?.moeda===moedaExibida)return original.valor;
 const equivalente=valorProdutoBRL(produto,field,converterParaBRL);
 const exibido=Number(converterDeBRL(equivalente,moedaExibida));
 if(!Number.isFinite(exibido)||exibido<0)throw Error('Cotação inválida no preço exibido');
 return exibido;
}
export function textoPrecoExibicaoProduto(produto,field,moedaExibida,converterParaBRL,converterDeBRL){
 const valor=precoExibicaoProduto(produto,field,moedaExibida,converterParaBRL,converterDeBRL);
 return valor.toFixed(moedaExibida==='PYG'?0:2);
}

/**
 * When a customer's price tier changes, rebind the cart item's native source.
 * Otherwise an FX refresh can silently restore the previous tier's amount.
 * Never change the product catalog itself.
 */
export function reprecificarItemPDVPorPerfil(item,produto,campo,moedaExibida,converterParaBRL,converterDeBRL) {
 if(!['precoBRL','preco2BRL','preco3BRL'].includes(campo))throw Error('Tabela de preço inválida');
 const precoOrigemPDV=quantiaOriginalProduto(produto,campo);
 const precoPraticadoBRL=valorProdutoBRL(produto,campo,converterParaBRL);
 const precoTexto=textoPrecoExibicaoProduto(produto,campo,moedaExibida,converterParaBRL,converterDeBRL);
 if(!Number.isFinite(precoPraticadoBRL)||precoPraticadoBRL<0)throw Error('Preço do produto inválido');
 return {...item,precoPraticadoBRL,precoTexto,precoOrigemPDV,
   precoDigitadoOriginal:null,precoEntradaInvalida:false,
   snapshotMoedasProduto:produto?.valoresMonetarios||null};
}

/** Sovereign product reading. Legacy BRL cannot silently become PYG. */
export function apurarPrecoProdutoNativo(produto,field,moedaLoja,taxasCambio){
 const original=quantiaOriginalProduto(produto,field);
 if(!original){
   if(moedaLoja==='BRL'&&Number.isFinite(Number(produto?.[field]))&&Number(produto[field])>=0)
     return {status:'confirmado_compatibilidade_brl',moeda:'BRL',
       valorMinor:parseMoney(Number(produto[field]).toFixed(2),'BRL')};
   return {status:'pendente_origem',moeda:moedaLoja,valorMinor:null};
 }
 const amountMinor=parseMoney(String(original.valor),original.moeda);
 if(original.moeda!==moedaLoja)
   return {status:'pendente_moeda_contratual',moeda:moedaLoja,valorMinor:null,
     moedaOrigem:original.moeda,valorOriginalMinor:amountMinor};
 return {status:'confirmado',moeda:moedaLoja,valorMinor:amountMinor,
   moedaOrigem:original.moeda,valorOriginalMinor:amountMinor};
}
export function formatarPrecoProdutoNativo(produto,field,moedaLoja,taxasCambio,locale='es-PY'){
 const r=apurarPrecoProdutoNativo(produto,field,moedaLoja,taxasCambio);
 if(!r.valorMinor)return null;
 return new Intl.NumberFormat(locale,{style:'currency',currency:moedaLoja,
   minimumFractionDigits:moedaLoja==='PYG'?0:2,maximumFractionDigits:moedaLoja==='PYG'?0:2})
   .format(Number(formatMoneyMinor(r.valorMinor,moedaLoja)));
}

export function projetarProdutoMonetario(produto,converterParaBRL){
 return {...produto,...Object.fromEntries(CAMPOS_MONETARIOS_PRODUTO.map(field=>[field,valorProdutoBRL(produto,field,converterParaBRL)]))};
}
export function registrarValoresProduto(form,padrao,converterParaBRL,original=null,converterDeBRL=v=>v){
 const anteriores=original?produtoParaFormularioMonetario(original,padrao,converterDeBRL):null;
 const campos={...original?.valoresMonetarios?.campos};
 const equivalentes=valoresProdutoParaBRL(form,padrao,converterParaBRL);
 for(const field of CAMPOS_MONETARIOS_PRODUTO){
  const moeda=moedaCampo(form,field,padrao);
  const semAlteracao=anteriores&&String(form[field]??'')===String(anteriores[field])
   &&moeda===moedaCampo(anteriores,field,padrao);
  if(semAlteracao){equivalentes[field]=Number(original[field]||0);continue;}
  const parsed=interpretarValorMonetario(form[field],moeda,{permitirVazio:true});
  if(!parsed.ok)throw Error(parsed.erro);
  campos[field]={valor:parsed.valor,moeda,equivalenteRegistroBRL:equivalentes[field],taxaRegistro:1/converterParaBRL(1,moeda)};
 }
 return {...equivalentes,valoresMonetarios:{versao:1,campos}};
}
export function atualizarQuantiaProduto(produto,field,valor,moeda,converterParaBRL){
 const parsed=interpretarValorMonetario(valor,moeda);
 if(!parsed.ok)throw Error(parsed.erro);
 return {...produto,[field]:converterParaBRL(parsed.valor,moeda),valoresMonetarios:{versao:1,campos:{...produto?.valoresMonetarios?.campos,[field]:{valor:parsed.valor,moeda,equivalenteRegistroBRL:converterParaBRL(parsed.valor,moeda),taxaRegistro:1/converterParaBRL(1,moeda)}}}};
}

export function custoFornecedorProdutoBRL(produto,converterParaBRL){
 const original=produto?.ultimoCustoFornecedorOriginal;
 if(original){
  const parsed=interpretarValorMonetario(original.valor,original.moeda);
  if(!parsed.ok)throw Error(parsed.erro);
  return converterParaBRL(parsed.valor,original.moeda);
 }
 return Number.isFinite(produto?.ultimoCustoFornecedorBRL)&&produto.ultimoCustoFornecedorBRL>=0
  ?produto.ultimoCustoFornecedorBRL:valorProdutoBRL(produto,'custoBRL',converterParaBRL);
}

/**
 * Keeps an in-progress counter price anchored in its explicit source currency.
 * Do not infer currency for legacy products without original monetary metadata.
 * No catalog, receipt or historical document is mutated by this projection.
 */
export function atualizarCotacaoPrecoItemPDV(item, moedaExibicao, converterParaBRL, converterDeBRL) {
  const origem = item?.precoDigitadoOriginal || item?.precoOrigemPDV;
  if (!origem) return item;
  const parsed = interpretarValorMonetario(origem.valor, origem.moeda);
  if (!parsed.ok || !(Number(converterParaBRL(1, origem.moeda)) > 0)) return item;
  const valorBRL = Number(converterParaBRL(parsed.valor, origem.moeda));
  const exibido = origem.moeda === moedaExibicao ? parsed.valor : Number(converterDeBRL(valorBRL, moedaExibicao));
  if (!Number.isFinite(valorBRL) || !Number.isFinite(exibido) || valorBRL < 0 || exibido < 0) return item;
  const precoTexto = exibido.toFixed(moedaExibicao === 'PYG' ? 0 : 2);
  if (item.precoPraticadoBRL === valorBRL && item.precoTexto === precoTexto) return item;
  return { ...item, precoPraticadoBRL: valorBRL, precoTexto };
}

/**
 * A recovered VIPE counter draft can predate native-price snapshots.
 * The existing, explicitly visible editable unit field is the price the
 * operator is confirming, not a new catalog price. Never infer currency for
 * catalog products or other stores, and never run with recorded payments.
 */
export function recuperarPrecoVisivelRascunhoPDV(item, moeda, converterParaBRL, converterDeBRL) {
  if (!item || item.precoOrigemPDV || item.precoDigitadoOriginal) return item;
  if (moeda !== 'PYG' || typeof item.precoTexto !== 'string') return item;
  // Old drafts formatted PYG as "25000.00". Accept only an all-zero
  // decimal suffix from this saved editable field; never round real fractions.
  const texto = item.precoTexto.trim();
  const textoInteiro = /^\d+[.,]0{1,2}$/.test(texto) ? texto.replace(/[.,]0{1,2}$/, '') : texto;
  const parsed = interpretarValorMonetario(textoInteiro, 'PYG');
  if (!parsed.ok || !(parsed.valor > 0)) return item;
  const original = { ...item, precoDigitadoOriginal: { valor: parsed.valor, moeda: 'PYG' } };
  return atualizarCotacaoPrecoItemPDV(original, moeda, converterParaBRL, converterDeBRL);
}

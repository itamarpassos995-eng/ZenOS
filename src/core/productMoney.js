import { interpretarValorMonetario } from './cashMoneyInput.js';
const fields=['custoBRL','precoBRL','preco2BRL','preco3BRL'];
export function produtoParaFormularioMonetario(produto, moeda, converterDeBRL) {
  const moedaCusto=quantiaOriginalProduto(produto,'custoBRL')?.moeda||moeda;
  const moedaPreco=quantiaOriginalProduto(produto,'precoBRL')?.moeda||moeda;
  return {...Object.fromEntries(fields.map(field=>{
    const original=quantiaOriginalProduto(produto,field);
    const codigo=field==='custoBRL'?moedaCusto:moedaPreco;
    const valor=original?original.valor*converterDeBRL(1,codigo)/converterDeBRL(1,original.moeda):converterDeBRL(Number(produto[field]||0),codigo);
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

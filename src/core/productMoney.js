import { interpretarValorMonetario } from './cashMoneyInput.js';
const fields=['custoBRL','precoBRL','preco2BRL','preco3BRL'];
export function produtoParaFormularioMonetario(produto, moeda, converterDeBRL) {
  return Object.fromEntries(fields.map(field=>[field,Number(converterDeBRL(Number(produto[field]||0),moeda)).toFixed(moeda==='PYG'?0:2)]));
}
export function valoresProdutoParaBRL(form,moeda,converterParaBRL) {
  const result={};
  for(const field of fields){
    const parsed=interpretarValorMonetario(form[field],moeda,{permitirVazio:true});
    if(!parsed.ok)throw Error(field+': '+parsed.erro);
    const value=Number(converterParaBRL(parsed.valor,moeda));
    if(!Number.isFinite(value)||value<0)throw Error('Cotação inválida.');
    result[field]=value;
  }
  if(!(result.precoBRL>0))throw Error('Informe um preço maior que zero.');
  return result;
}

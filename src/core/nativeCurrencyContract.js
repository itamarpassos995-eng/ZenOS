/**
 * Contrato de moeda nativa (BRL, PYG, USD, EUR).
 * Uma obrigação nasce em moeda própria. Taxas servem exclusivamente para
 * cotar uma visualização ou registrar um recebimento, nunca para reprecificar
 * a obrigação gravada.
 *
 * Convenção das taxas do ZenOS: unidades da moeda por 1 BRL.
 */
const MOEDAS = new Set(['BRL','PYG','USD','EUR']);
const escala = moeda => moeda==='PYG'?1:100;
function numeroValido(valor,rotulo) {
  if(typeof valor!=='number'||!Number.isFinite(valor)||valor<0)
    throw new Error(rotulo+' inválido.');
  return valor;
}
function moedaValida(moeda) {
  if(!MOEDAS.has(moeda))throw new Error('Moeda não suportada: '+String(moeda));
  return moeda;
}
function taxa(moeda,taxas) {
  moedaValida(moeda);
  if(moeda==='BRL')return 1;
  const valor=taxas?.[moeda];
  if(typeof valor!=='number'||!Number.isFinite(valor)||valor<=0)
    throw new Error('Cotação indisponível para '+moeda);
  return valor;
}
export function criarObrigacaoNativa(valor,moeda) {
  moedaValida(moeda);numeroValido(valor,'Valor');
  const arredondado=Math.round((valor+Number.EPSILON)*escala(moeda))/escala(moeda);
  if(Math.abs(arredondado-valor)>1e-7)
    throw new Error('Precisão inválida na moeda '+moeda);
  return Object.freeze({moeda,valor:arredondado});
}
export function cotarObrigacaoNativa(obrigacao,moedaDestino,taxas) {
  const origem=criarObrigacaoNativa(obrigacao?.valor,obrigacao?.moeda);
  moedaValida(moedaDestino);
  const taxaOrigem=taxa(origem.moeda,taxas),taxaDestino=taxa(moedaDestino,taxas);
  const valorBruto=origem.valor/taxaOrigem*taxaDestino;
  const valor=Math.round((valorBruto+Number.EPSILON)*escala(moedaDestino))/escala(moedaDestino);
  return {moedaOrigem:origem.moeda,valorOriginal:origem.valor,
    moedaDestino,valor, taxaOrigem, taxaDestino};
}
/**
 * Registra pagamento em moeda física escolhida, com cotação comprovada.
 * Não modifica obrigacao. Qualquer quitação parcial continua calculada
 * contra o saldo nativo, não contra novo valor convertido em BRL.
 */
export function registrarPagamentoContraObrigacao(obrigacao,valorPago,moedaPagamento,taxas) {
  const contrato=criarObrigacaoNativa(obrigacao?.valor,obrigacao?.moeda);
  criarObrigacaoNativa(valorPago,moedaPagamento);
  const taxaContrato=taxa(contrato.moeda,taxas);
  const taxaPagamento=taxa(moedaPagamento,taxas);
  const recebidoNativoBruto=valorPago/taxaPagamento*taxaContrato;
  const recebidoNativo=Math.round((recebidoNativoBruto+Number.EPSILON)*escala(contrato.moeda))/escala(contrato.moeda);
  const aplicadoNativo=Math.min(contrato.valor,recebidoNativo);
  const saldoNativo=Math.round((contrato.valor-aplicadoNativo)*escala(contrato.moeda))/escala(contrato.moeda);
  return {moedaObrigacao:contrato.moeda,valorObrigacao:contrato.valor,
    moedaPagamento,valorPago, taxaContrato,taxaPagamento,
    valorConvertidoBRL:valorPago/taxaPagamento,
    aplicadoNativo,saldoNativo,
    excedenteNativo:Math.max(0,recebidoNativo-contrato.valor)};
}

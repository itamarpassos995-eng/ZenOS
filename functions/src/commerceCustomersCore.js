import {createHash} from 'node:crypto';

/**
 * Cadastro de contato opt-in do Commerce. Identidade estável por loja + telefone
 * validado, sem atrelar à sessão anônima descartada ao atualizar a vitrine.
 * Nunca é o cadastro financeiro de Clientes & Fiado.
 */
export function idClienteOnline(lojaId,telefone){
 if(typeof lojaId!=='string'||!lojaId||typeof telefone!=='string'||
    !/^[1-9]\d{9,14}$/.test(telefone))
  throw new Error('Identidade de contato inválida.');
 return createHash('sha256').update(['commerce-customer-v1',lojaId,telefone].join('|')).digest('hex');
}

/** Um checkout anônimo não pode sobrescrever perfil/consentimento JÁ verificados. */
export function prepararCadastroOnline({pedido,pedidoId,anterior,agora}){
 if(pedido?.cadastroSolicitado!==true)throw new Error('Cadastro não solicitado.');
 if(!/^[a-f0-9]{32}$/.test(pedidoId)||!pedido?.cliente?.nome||!pedido?.cliente?.telefone)
  throw new Error('Dados de cadastro inconsistentes.');
 const verificado=anterior?.titularidadeVerificada===true;
 if(verificado){
  // Pessoa sem confirmação por OTP não pode trocar titular, permissões ou telefone.
  return {
   primeiroPedido:anterior.primeiroPedido||pedidoId,ultimoPedido:pedidoId,
   atualizadoEm:agora,ultimoCadastroSolicitadoEm:agora
  };
 }
 return {
  nome:pedido.cliente.nome,telefone:pedido.cliente.telefone,origem:'commerce',
  primeiroPedido:anterior?.primeiroPedido||pedidoId,
  ultimoPedido:pedidoId,
  criadoEm:anterior?.criadoEm||agora,atualizadoEm:agora,
  cadastroSolicitado:true,
  marketingStatus:pedido.aceitePromocoes===true?'pendente_verificacao':'nao_autorizado',
  marketingAutorizado:false,
  consentimentoEm:pedido.aceitePromocoes===true?agora:null,
  consentimentoVersao:'commerce-optin-v1',
  titularidadeVerificada:false
 };
}

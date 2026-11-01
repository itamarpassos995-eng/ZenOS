// Não apresenta uma mensagem portuguesa do backend numa interface espanhola.
// A causa técnica permanece disponível no código do erro/log do serviço.
export function mensagemFiscalLocalizada(error, tx, contexto='cadastro') {
 const original=typeof error?.message==='string'?error.message.trim():'';
 const es=contexto==='credenciais'
  ? 'Revise el certificado, la contraseña y las credenciales informadas. Si el registro cambió, actualice el estado antes de reintentar.'
  : 'Revise los datos fiscales y los requisitos pendientes. Actualice el estado si el registro cambió antes de reintentar.';
 const en=contexto==='credenciais'
  ? 'Review the certificate, password and credentials. If registration changed, refresh its status before retrying.'
  : 'Review fiscal details and pending requirements. If registration changed, refresh its status before retrying.';
 return tx(original||'Revise os dados fiscais antes de continuar.',es,en);
}

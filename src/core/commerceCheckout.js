// Guarda síncrona e recuperação de confirmação sem persistir dados pessoais.
export function criarCheckoutCommerce({consultar,enviar,guardarPendente}) {
 let emCurso=false;
 const executar=async fn=>{
  if(emCurso)throw new Error('Aguarde a confirmação em andamento.');
  emCurso=true;try{return await fn();}finally{emCurso=false;}
 };
 const recuperar=chave=>executar(async()=>{
  const r=await consultar(chave);
  if(r?.encontrado===true){if(!/^[a-f0-9]{32}$/.test(r.pedido?.id||''))throw new Error('Confirmação inválida.');guardarPendente(false);return r.pedido;}
  if(r?.encontrado!==false)throw new Error('Não foi possível verificar este envio. Tente consultar novamente.');
  guardarPendente(false);return null;
 });
 return {recuperar,confirmar:(chave,dados)=>executar(async()=>{
  // Persistir somente chave e estado ANTES de enviar. Se a resposta se perder,
  // a próxima sessão consulta a mesma identidade/chave, sem criar outro pedido.
  guardarPendente(true);
  try{const r=await enviar(chave,dados);if(!/^[a-f0-9]{32}$/.test(r?.id||''))throw new Error('Confirmação inválida.');guardarPendente(false);return r;}
  catch(e){
   // Uma falha de transporte não prova que o servidor deixou de gravar.
   // Até a consulta autoritativa, não liberar edição nem gerar outra chave.
   throw e;
  }
 })};
}

// O prazo apenas devolve controle à interface; não cancela uma gravação remota.
export function comPrazoCommerce(operacao,ms=30000){
 let timer;
 return Promise.race([Promise.resolve().then(operacao),new Promise((_,reject)=>{
  timer=setTimeout(()=>reject(new Error('A conexão demorou mais que o esperado. Verifique o envio antes de confirmar novamente.')),ms);
 })]).finally(()=>clearTimeout(timer));
}

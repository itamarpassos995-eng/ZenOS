import { collection, getDocsFromServer, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';

// Escopos financeiros só podem ser usados na loja autenticada. Toda leitura
// que serve para autorizar/conciliar uma operação é exclusivamente do servidor.
const raiz=(db,userId)=>{
 if(!db||!userId)throw Error('Loja não identificada para conferência financeira.');
 return collection(db,'lojas',String(userId),'financeiro_livro');
};
const itens=snap=>snap.docs.map(d=>({id:d.id,...d.data()}));

export function assinarJanelaRecenteDeReconciliacao({db,userId,onData,onError,max=25}={}){
 if(!userId)return()=>{};
 if(!Number.isSafeInteger(max)||max<1||max>100)throw Error('Janela inválida.');
 return onSnapshot(query(raiz(db,userId),orderBy('createdAt','desc'),limit(max)),
  snap=>onData?.(itens(snap),{fromCache:snap.metadata.fromCache,hasPendingWrites:snap.metadata.hasPendingWrites,
   parcial:true,max}),err=>onError?.(err));
}

// Não paginar estas consultas: todos os movimentos da identidade/sessão são
// necessários à validação de recebimento e fechamento de caixa.
export async function conferirLivroClienteNoServidor({db,userId,clienteId}={}){
 if(clienteId==null||String(clienteId).trim()==='')throw Error('Cliente não identificado.');
 const key=String(clienteId).trim();
 const ids=[key];
 if(/^[1-9][0-9]*$/.test(key)&&Number.isSafeInteger(Number(key)))ids.push(Number(key));
 const filtro=ids.length===1?where('clienteId','==',key):where('clienteId','in',ids);
 const snap=await getDocsFromServer(query(raiz(db,userId),filtro));
 return {itens:itens(snap),completoParaId:true,confirmadoPeloServidor:true};
}
export async function conferirLivroSessaoNoServidor({db,userId,sessaoId}={}){
 if(sessaoId==null||String(sessaoId).trim()==='')throw Error('Caixa sem sessão identificada.');
 const key=String(sessaoId);
 const ids=[key];if(/^[1-9][0-9]*$/.test(key)&&Number.isSafeInteger(Number(key)))ids.push(Number(key));
 const filtro=ids.length===1?where('sessaoId','==',key):where('sessaoId','in',ids);
 const snap=await getDocsFromServer(query(raiz(db,userId),filtro));
 return {itens:itens(snap),completoParaSessao:true,confirmadoPeloServidor:true};
}
// Auditoria integral é excepcional e acionada explicitamente pelo operador.
// Não usar esta leitura no login nem para renderizar cadastro ou PDV.
export async function conferirLivroCompletoNoServidor({db,userId}={}){
 const snap=await getDocsFromServer(raiz(db,userId));
 return {itens:itens(snap),confirmadoPeloServidor:true};
}
export function assinarLivroSessaoEnquantoAberta({db,userId,sessaoId,onData,onError}={}){
 if(!sessaoId)throw Error('Sessão não identificada.');
 return onSnapshot(query(raiz(db,userId),where('sessaoId','==',String(sessaoId))),
  snap=>onData?.(itens(snap),{confirmado:!snap.metadata.fromCache&&!snap.metadata.hasPendingWrites}),
  err=>onError?.(err));
}
export function assinarUltimosFinanceirosNaAuditoria({db,userId,onData,onError,max=30}={}){
 return onSnapshot(query(raiz(db,userId),orderBy('createdAt','desc'),limit(max)),
  snap=>onData?.(itens(snap),{confirmado:!snap.metadata.fromCache&&!snap.metadata.hasPendingWrites}),
  err=>onError?.(err));
}

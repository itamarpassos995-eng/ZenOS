import { collection, documentId, getDocsFromServer, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { periodoValido } from './receivablesSummary.js';
export const TAMANHO_PAGINA_EXTRATO=50;

// O filtro ocorre no Firestore, antes da paginação. O cursor é um snapshot.
// Falha de índice/rede/permissão é propagada: jamais equivale a histórico vazio.
export async function buscarPaginaExtrato({db,userId,clienteId,inicio,fim,cursor=null,pageSize=TAMANHO_PAGINA_EXTRATO}={}) {
 if(!db||!userId||clienteId==null||String(clienteId).trim()==='')throw new Error('Loja ou cliente ausente.');
 if(!periodoValido(inicio,fim))throw new Error('O período pode ter no máximo 120 dias.');
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw new Error('Página inválida.');
 const inicioISO=new Date(inicio+'T00:00:00').toISOString();
 const fimExclusivo=new Date(fim+'T00:00:00');fimExclusivo.setDate(fimExclusivo.getDate()+1);
 const constraints=[where('clienteId','==',String(clienteId)),
  where('createdAt','>=',inicioISO),where('createdAt','<',fimExclusivo.toISOString()),
  orderBy('createdAt','desc'),orderBy(documentId(),'desc'),
  ...(cursor?[startAfter(cursor)]:[]),limit(pageSize)];
 const snap=await getDocsFromServer(query(collection(db,'lojas',String(userId),'financeiro_livro'),...constraints));
 return {itens:snap.docs.map(d=>({id:d.id,...d.data()})),
  cursor:snap.docs.at(-1)||null,possuiMais:snap.size===pageSize,
  confirmadoPeloServidor:true,escopoCompleto:false,legadoSemDataIncluido:false};
}
// Explicitamente solicitado: consulta TODOS os lançamentos deste cliente,
// incluindo documentos legados sem createdAt, sem varrer outras lojas/clientes.
export async function buscarHistoricoIntegralCliente({db,userId,clienteId}={}) {
 if(!db||!userId||clienteId==null)throw new Error('Loja ou cliente ausente.');
 const texto=String(clienteId);
 const variantes=[texto];
 if(/^[1-9][0-9]*$/.test(texto) && Number.isSafeInteger(Number(texto))) variantes.push(Number(texto));
 const snap=await getDocsFromServer(query(collection(db,'lojas',String(userId),'financeiro_livro'),
  where('clienteId',variantes.length===1?'==':'in',variantes.length===1?texto:variantes)));
 const itens=snap.docs.map(d=>({id:d.id,...d.data()}))
  .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||String(b.id).localeCompare(String(a.id)));
 return {itens,confirmadoPeloServidor:true,escopoCompleto:true,
  observacaoLegado:'Inclui vínculos numéricos quando compatíveis; documentos sem clienteId exigem auditoria separada.'};
}

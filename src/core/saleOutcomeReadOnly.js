import {doc,getDocFromServer} from 'firebase/firestore';
import {peekV2Session} from './operationalRepository.js';
import {hashV2} from './operationalV2Schema.js';

/**
 * Consulta SOMENTE-LEITURA: nunca interpreta ausência de comprovante como rejeição
 * e nunca utiliza cache para declarar venda confirmada.
 * Fonte V2: receipt da geração ativa (key + fingerprint do comando já gravado).
 * Fonte V1: chave recente no documento operacional (limite legado: 120).
 */
export async function consultarResultadoVendaServidor({db,userId,operationKey}) {
  const key=String(operationKey||'');
  if(!db||!userId||!key.startsWith('pdv:')||key.length<=4)
    return {status:'unknown',reason:'invalid_input'};
  try {
    const session=peekV2Session(db,userId);
    if(session){
      if(session.failed||session.control?.mode!=='v2'||!session.root)
        return {status:'unknown',reason:'v2_session_unavailable'};
      const id=await hashV2(key);
      const snap=await getDocFromServer(doc(db,...session.root,'operations',id));
      if(!snap.exists()) return {status:'unknown',reason:'receipt_not_found'};
      const receipt=snap.data();
      if(receipt?.key!==key||!receipt?.fingerprint)
        return {status:'unknown',reason:'receipt_mismatch'};
      return {status:'committed',source:'v2_receipt',sequence:receipt.sequence??null};
    }
    const snap=await getDocFromServer(doc(db,'lojas',String(userId),'dados','operacao'));
    if(!snap.exists()) return {status:'unknown',reason:'v1_not_found'};
    const data=snap.data();
    const recent=data?._syncMeta?.recentOperationKeys;
    const id=key.slice(4);
    const historico=Array.isArray(data?.historicoVendas)?data.historicoVendas:[];
    const match=historico.some(v=>String(v?.id??'')===id);
    if(Array.isArray(recent)&&recent.includes(key)&&match)
      return {status:'committed',source:'v1_recent_key_and_sale'};
    return {status:'unknown',reason:'no_positive_receipt'};
  } catch(error){
    return {status:'unknown',reason:'server_unavailable',code:String(error?.code||'unknown')};
  }
}

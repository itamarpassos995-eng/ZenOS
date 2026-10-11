// Reserva transacional fiscal; SEM emissão de rede dentro de transações.
// Fail closed: uma venda/ambiente só recebe uma reserva. Timeout nunca libera replay.
import {createHash} from 'node:crypto';

export class FiscalReservationError extends Error {
  constructor(code) { super(code); this.name='FiscalReservationError'; this.code=code; }
}
const exigir=(ok,code)=>{if(!ok)throw new FiscalReservationError(code);};
const ident=(s)=>typeof s==='string'&&/^[a-zA-Z0-9._:-]{1,180}$/.test(s);
const digest=(v)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const tipos=Object.freeze({BR:['nfe','nfce','nfse'],PY:['factura_electronica']});
const pendentes=Object.freeze(['reservada','envio_iniciado','resultado_incerto','consulta_pendente','rejeitada','autorizacao_informada']);

export function planoReservaFiscal({lojaId,vendaId,pais,tipoDocumento,ambiente='homologacao',conteudoHash,actorUid}={}){
  exigir([lojaId,vendaId,actorUid].every(ident),'FISCAL_IDENTIDADE_INVALIDA');
  exigir(tipos[pais]?.includes(tipoDocumento),'FISCAL_TIPO_PAIS_INVALIDO');
  exigir(ambiente==='homologacao','FISCAL_PRODUCAO_BLOQUEADA');
  exigir(typeof conteudoHash==='string'&&/^[a-f\d]{64}$/i.test(conteudoHash),'FISCAL_HASH_INVALIDO');
  const lockId=digest([lojaId,vendaId,ambiente]);
  const operacaoId=digest([lojaId,vendaId,ambiente,tipoDocumento]);
  return Object.freeze({
    lockPath:`lojas/${lojaId}/fiscal_sale_locks/${lockId}`,
    operationPath:`lojas/${lojaId}/fiscal_operations/${operacaoId}`,
    lockId,operacaoId,lojaId,vendaId,pais,tipoDocumento,ambiente,conteudoHash:conteudoHash.toLowerCase(),actorUid,
  });
}

// firestore: instância Admin SDK. Usa apenas create() (precondição de inexistência).
// A transação grava a reserva sem depender de estado editável pelo navegador.
export async function reservarEmissaoFiscal({firestore,plano,now}={}){
  exigir(firestore&&typeof firestore.runTransaction==='function'&&typeof firestore.doc==='function','FISCAL_DB_INDISPONIVEL');
  exigir(plano&&ident(plano.lojaId)&&ident(plano.vendaId)&&ident(plano.actorUid),'FISCAL_PLANO_INVALIDO');
  const esperado=planoReservaFiscal(plano);
  exigir(plano.lockPath===esperado.lockPath&&plano.operationPath===esperado.operationPath,'FISCAL_PLANO_INVALIDO');
  exigir(typeof now==='string'&&!Number.isNaN(Date.parse(now)),'FISCAL_DATA_INVALIDA');
  const lock=firestore.doc(plano.lockPath),op=firestore.doc(plano.operationPath);
  return firestore.runTransaction(async tx=>{
    const [lockSnapshot,opSnapshot]=await Promise.all([tx.get(lock),tx.get(op)]);
    if(lockSnapshot.exists||opSnapshot.exists){
      // Nunca libera nem transmite novamente, mesmo após timeout ou erro de comunicação.
      const dado=opSnapshot.exists?opSnapshot.data():null;
      if(dado && dado.lojaId===plano.lojaId&&dado.vendaId===plano.vendaId&&dado.conteudoHash===plano.conteudoHash&&dado.tipoDocumento===plano.tipoDocumento){
        return {criada:false,operacaoId:plano.operacaoId,estado:dado.estado,requerConciliacao:true};
      }
      throw new FiscalReservationError('FISCAL_VENDA_JA_RESERVADA');
    }
    tx.create(lock,{lojaId:plano.lojaId,vendaId:plano.vendaId,ambiente:plano.ambiente,operacaoId:plano.operacaoId,createdAt:now});
    tx.create(op,{lojaId:plano.lojaId,vendaId:plano.vendaId,ambiente:plano.ambiente,pais:plano.pais,tipoDocumento:plano.tipoDocumento,conteudoHash:plano.conteudoHash,actorUid:plano.actorUid,estado:'reservada',createdAt:now,updatedAt:now});
    return {criada:true,operacaoId:plano.operacaoId,estado:'reservada',requerConciliacao:false};
  });
}

// Retorno de transporte não prova autorização; alterações exigem backend trusted separado.
export function classificacaoRetornoFiscal({resultado,erroDeRede=false}={}){
  if(erroDeRede)return 'resultado_incerto';
  exigir(resultado&&resultado.requerConciliacao===true,'FISCAL_RETORNO_INVALIDO');
  if(resultado.autorizacaoInformada===true)return 'autorizacao_informada';
  return 'consulta_pendente';
}
export function permiteReenvioAutomatico(estado){
  exigir(pendentes.includes(estado),'FISCAL_ESTADO_INVALIDO');
  return false;
}

import React,{useEffect,useState} from 'react';
import {distributionMoney} from '../core/distribution/i18n.js';
import './DistributionReconciliation.css';
const locales={
 pt:{title:'Conciliação financeira de origem',subtitle:'Conferência somente leitura. Nenhuma restituição, baixa ou estorno.',execute:'Conferir registros de origem',refresh:'Verificar alterações',sale:'Venda original',received:'Recebimentos comprovados',open:'Saldo aberto comprovado',pending:'Liquidação pendente',adjust:'Valor do ajuste',state:'Estado da conferência',issues:'Pendências e divergências',source:'Referências financeiras',history:'Histórico imutável',stale:'A origem foi modificada. A conciliação anterior está obsoleta.',unknown:'Não comprovado',noData:'Nenhuma conciliação registrada. Conferir não modifica saldos.',onlyFinance:'Detalhes financeiros restritos a operadores autorizados.',blocked:'A compensação financeira permanece bloqueada nesta etapa.'},
 es:{title:'Conciliación financiera de origen',subtitle:'Verificación de solo lectura. Sin reembolso, baja ni reversión.',execute:'Verificar registros de origen',refresh:'Comprobar cambios',sale:'Venta original',received:'Cobros comprobados',open:'Saldo abierto comprobado',pending:'Liquidación pendiente',adjust:'Valor del ajuste',state:'Estado de conciliación',issues:'Pendientes y diferencias',source:'Referencias financieras',history:'Historial inmutable',stale:'La fuente fue modificada. La conciliación anterior está obsoleta.',unknown:'Sin comprobar',noData:'No hay conciliación registrada. Verificar no modifica saldos.',onlyFinance:'Los detalles financieros son exclusivos de operadores autorizados.',blocked:'La compensación financiera continúa bloqueada en esta etapa.'}
};
const names={RECONCILIATION_REQUIRED:['Pendente de conciliação','Conciliación pendiente'],RECONCILED:['Conciliado com evidências','Conciliado con evidencias'],DISCREPANCY:['Divergência','Diferencia'],EXTERNAL_SETTLEMENT_PENDING:['Liquidação externa pendente','Liquidación externa pendiente'],FX_EVIDENCE_REQUIRED:['Câmbio histórico sem prova','Cambio histórico sin evidencia'],BLOCKED:['Bloqueado','Bloqueado'],STALE:['Obsoleto','Desactualizado']};
export default function DistributionReconciliation({client,adjustment,session,language='pt'}){
 const es=language==='es',t=locales[es?'es':'pt'];
 const allowed=session.capabilities?.includes('finance')||session.capabilities?.includes('admin');
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[history,setHistory]=useState([]);
 const title=s=>names[s]?.[es?1:0]||s;
 const money=a=>a?distributionMoney(a):t.unknown;
 const load=async()=>{
  setBusy(true);setError('');try{
   const r=await client.reconciliationQuery(adjustment.id);
   setData(r.reconciliation);
  }catch(e){if(e.code!=='RECONCILIATION_NOT_FOUND')setError(e.code||'QUERY_FAILED');}
  finally{setBusy(false);}
 };
 useEffect(()=>{setData(null);setHistory([]);if(allowed)load();},[adjustment.id,allowed]);
 const check=async()=>{
  setBusy(true);setError('');try{
   const r=await client.reconciliationCommand(adjustment.id,adjustment.revision);
   const loaded=await client.reconciliationQuery(adjustment.id);
   setData(loaded.reconciliation);setHistory(a=>[...a,{revision:r.revision,state:r.state}]);
  }catch(e){setError(e.code||'RECONCILIATION_FAILED');}
  finally{setBusy(false);}
 };
 const historical=async revision=>{
  setBusy(true);setError('');try{
   const r=await client.reconciliationQuery(adjustment.id,'history',revision);setData(r.reconciliation);
  }catch(e){setError(e.code||'QUERY_FAILED');}finally{setBusy(false);}
 };
 if(!allowed)return <section className="dist-reconciliation"><h4>{t.title}</h4><p>{t.onlyFinance}</p></section>;
 return <section className="dist-reconciliation" data-testid="distribution-reconciliation">
  <div className="dist-reconciliation-header"><div><h4>{t.title}</h4><p>{t.subtitle}</p></div>
   <div className="dist-actionbar"><button disabled={busy} onClick={load}>{t.refresh}</button>
    <button className="primary" disabled={busy} onClick={check}>{t.execute}</button></div>
  </div>
  {error&&<p role="alert" className="dist-alert">{error}</p>}
  {!data?<p>{t.noData}</p>:<>
   <p role="status" className="dist-reconciliation-state">{t.state}: <strong>{title(data.state)}</strong></p>
   {data.state==='STALE'&&<p role="alert">{t.stale}</p>}
   <div className="dist-reconciliation-values">
    <article><small>{t.sale}</small><strong>{money(data.saleTotal)}</strong></article>
    <article><small>{t.received}</small><strong>{money(data.verifiedReceived)}</strong></article>
    <article><small>{t.open}</small><strong>{money(data.verifiedOpen)}</strong></article>
    <article><small>{t.pending}</small><strong>{money(data.unconfirmedReceipts)}</strong></article>
    <article><small>{t.adjust}</small><strong>{money(data.adjustmentAmount)}</strong></article>
   </div>
   <p>{t.blocked}</p>
   {data.issues?.length>0&&<div className="dist-reconciliation-issues"><strong>{t.issues}</strong><ul>{data.issues.map(i=><li key={i}>{i}</li>)}</ul></div>}
   <details><summary>{t.source}</summary><p>{data.sourceIds?.saleId} · {data.sourceIds?.ledgerIds?.join(', ')||t.unknown}</p><p>{data.sourceFingerprint}</p></details>
   <details><summary>{t.history}</summary>{Array.from({length:data.revision+1},(_,i)=><button key={i} onClick={()=>historical(i)} disabled={busy}>v{i+1}</button>)}</details>
  </>}
 </section>;
}

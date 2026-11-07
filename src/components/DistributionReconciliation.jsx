import React,{useEffect,useState} from 'react';
import {distributionMoney} from '../core/distribution/i18n.js';
import './DistributionReconciliation.css';
const locales={
 pt:{title:'Conciliação financeira de origem',subtitle:'Conferência somente leitura. Nenhuma restituição, baixa ou estorno.',execute:'Conferir registros de origem',refresh:'Verificar alterações',sale:'Venda original',received:'Recebimentos comprovados',open:'Saldo aberto comprovado',pending:'Liquidação pendente',adjust:'Valor do ajuste',state:'Estado da conferência',issues:'Pendências e divergências',source:'Referências financeiras',installments:'Parcelas vinculadas',payments:'Eventos financeiros comprováveis',previous:'Compensações anteriores',returns:'Devoluções e estornos anteriores',unverified:'Liquidação externa não comprovada',never:'Contrato não executável — revalidação obrigatória na Entrega C',history:'Histórico imutável',stale:'A origem foi modificada. A conciliação anterior está obsoleta.',unknown:'Não comprovado',noData:'Nenhuma conciliação registrada. Conferir não modifica saldos.',onlyFinance:'Detalhes financeiros restritos a operadores autorizados.',blocked:'A compensação financeira permanece bloqueada nesta etapa.'},
 es:{title:'Conciliación financiera de origen',subtitle:'Verificación de solo lectura. Sin reembolso, baja ni reversión.',execute:'Verificar registros de origen',refresh:'Comprobar cambios',sale:'Venta original',received:'Cobros comprobados',open:'Saldo abierto comprobado',pending:'Liquidación pendiente',adjust:'Valor del ajuste',state:'Estado de conciliación',issues:'Pendientes y diferencias',source:'Referencias financieras',installments:'Cuotas vinculadas',payments:'Eventos financieros comprobables',previous:'Compensaciones anteriores',returns:'Devoluciones y reversiones anteriores',unverified:'Liquidación externa sin comprobar',never:'Contrato no ejecutable — nueva validación obligatoria en la Entrega C',history:'Historial inmutable',stale:'La fuente fue modificada. La conciliación anterior está obsoleta.',unknown:'Sin comprobar',noData:'No hay conciliación registrada. Verificar no modifica saldos.',onlyFinance:'Los detalles financieros son exclusivos de operadores autorizados.',blocked:'La compensación financiera continúa bloqueada en esta etapa.'}
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
   {data.schema===2&&<>
    <p className="dist-reconciliation-state">{t.never}</p>
    <p>{t.previous}: <strong>{money(data.previousCompensations)}</strong></p>
    <details><summary>{t.installments} ({data.installments?.length||0})</summary>
     <div className="dist-reconciliation-values">{(data.installments||[]).map(inst=>
      <article key={inst.id}><strong>{inst.id} · {inst.state}</strong>
       <small>{money(inst.original)} · {money(inst.received)} · {money(inst.outstanding)}</small>
       <small>{inst.receivableId}</small></article>)}</div>
    </details>
    <details><summary>{t.payments} ({data.payments?.length||0})</summary>
     <div className="dist-reconciliation-values">{(data.payments||[]).map(e=>
      <article key={e.id}><strong>{e.id} · {e.kind}</strong>
       <small>{e.currency} {e.amount}</small><small>{e.installmentId} · {e.status||''}</small></article>)}</div>
    </details>
   </>}
   {data.returnLineage?.items?.length>0&&
    <details className="dist-reconciliation-issues">
     <summary>{t.returns} ({data.returnLineage.items.length}) · {data.returnLineage.classification}</summary>
     <p>{t.unverified}</p>
     <ul>{data.returnLineage.items.map((entry,i)=>
      <li key={entry.ledgerId||entry.returnId||i}>
       {entry.returnId} · {entry.status} · {entry.reason} · {entry.ledgerId||t.unknown}
      </li>)}</ul>
    </details>}
   {data.issues?.length>0&&<div className="dist-reconciliation-issues"><strong>{t.issues}</strong><ul>{data.issues.map(i=><li key={i}>{i}</li>)}</ul></div>}
   <details><summary>{t.source}</summary><p>{data.sourceIds?.saleId} · {data.sourceIds?.ledgerIds?.join(', ')||t.unknown}</p><p>{data.sourceFingerprint}</p></details>
   <details><summary>{t.history}</summary>{Array.from({length:data.revision+1},(_,i)=><button key={i} onClick={()=>historical(i)} disabled={busy}>v{i+1}</button>)}</details>
  </>}
 </section>;
}

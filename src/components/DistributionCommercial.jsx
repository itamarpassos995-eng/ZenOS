import React,{useCallback,useEffect,useRef,useState} from 'react';
import {distributionMoney} from '../core/distribution/i18n.js';
import {FISCAL_CANDIDATES,INTERNAL_FISCAL_WARNING,ADJUSTMENT_TYPES,TYPES_BY_OCCURRENCE} from '../core/distribution/phase31Commercial.js';
import './DistributionCommercial.css';
const messages={
 pt:{title:'Ajustes comerciais e documentos fiscais',subtitle:'Rascunhos internos. Nenhuma movimentação financeira.',new:'Preparar ajuste comercial',quantity:'Quantidade',kind:'Motivo do ajuste',fiscal:'Candidato fiscal (revisão obrigatória)',none:'Sem candidato',create:'Salvar rascunho',empty:'Nenhum ajuste preparado.',status:'Estado interno',source:'Venda original',amount:'Valor comercial histórico',next:'Próxima página',reload:'Atualizar',view:'Consultar / reimprimir',version:'Versão histórica',print:'Imprimir espelho interno',reason:'Justificativa da decisão',review:'Encaminhar conferência',fiscalReview:'Encaminhar revisão fiscal',legal:'Bloquear até parecer fiscal',reject:'Rejeitar',cancel:'Descartar',internal:'Revisado internamente',return:'Voltar',pay:'Restituição e abatimento não executados',original:'Fatura original',cannot:'Documentação fiscal original não verificada; transmissão bloqueada.',state:{DRAFT:'Rascunho',COMMERCIAL_REVIEW:'Conferência comercial',FISCAL_REVIEW:'Revisão fiscal',LEGAL_REVIEW_REQUIRED:'Análise legal pendente',INTERNALLY_REVIEWED:'Revisado internamente',REJECTED:'Rejeitado',CANCELLED:'Descartado'},errors:{ADJUSTMENT_QUANTITY_EXCEEDED:'Quantidade acima do disponível para esta ocorrência.',ADJUSTMENT_TRANSITION_FORBIDDEN:'Transição não permitida.',FORBIDDEN:'Operador sem permissão.',REVISION_CONFLICT:'Outro operador alterou este registro. Atualize.',IDEMPOTENCY_CONFLICT:'Chave utilizada em outra operação.'}},
 es:{title:'Ajustes comerciales y documentos fiscales',subtitle:'Borradores internos. Sin movimientos financieros.',new:'Preparar ajuste comercial',quantity:'Cantidad',kind:'Motivo del ajuste',fiscal:'Candidato fiscal (revisión obligatoria)',none:'Sin candidato',create:'Guardar borrador',empty:'No se prepararon ajustes.',status:'Estado interno',source:'Venta original',amount:'Importe comercial histórico',next:'Página siguiente',reload:'Actualizar',view:'Consultar / reimprimir',version:'Versión histórica',print:'Imprimir espejo interno',reason:'Justificación de la decisión',review:'Enviar a revisión comercial',fiscalReview:'Enviar a revisión fiscal',legal:'Bloquear hasta dictamen fiscal',reject:'Rechazar',cancel:'Descartar',internal:'Revisado internamente',return:'Volver',pay:'Reintegro y descuento no ejecutados',original:'Factura original',cannot:'Documento fiscal original no verificado; transmisión bloqueada.',state:{DRAFT:'Borrador',COMMERCIAL_REVIEW:'Revisión comercial',FISCAL_REVIEW:'Revisión fiscal',LEGAL_REVIEW_REQUIRED:'Revisión legal pendiente',INTERNALLY_REVIEWED:'Revisado internamente',REJECTED:'Rechazado',CANCELLED:'Descartado'},errors:{ADJUSTMENT_QUANTITY_EXCEEDED:'Cantidad por encima del límite para esta incidencia.',ADJUSTMENT_TRANSITION_FORBIDDEN:'Transición no permitida.',FORBIDDEN:'Operador sin permiso.',REVISION_CONFLICT:'Otro operador modificó el registro. Actualice.',IDEMPOTENCY_CONFLICT:'Clave utilizada en otra operación.'}}
};
const TYPES={TOTAL_REFUSAL:'TOTAL_RETURN',PARTIAL_REFUSAL:'PARTIAL_RETURN',DELIVERY_SHORTAGE:'SHORTAGE',PICKING_SHORTAGE:'SHORTAGE',DAMAGED:'DAMAGED',WRONG_PRODUCT:'WRONG_PRODUCT',REPLACEMENT:'REPLACEMENT',INVOICE_DELIVERY_MISMATCH:'INVOICE_DELIVERY_MISMATCH'};
export default function DistributionCommercial({client,occurrence,session,language='pt'}){
 const t=messages[language==='es'?'es':'pt'];
 const [items,setItems]=useState([]),[cursor,setCursor]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[form,setForm]=useState(null);
 const [selected,setSelected]=useState(null),[representation,setRepresentation]=useState(null),[reason,setReason]=useState(''),[loading,setLoading]=useState(0);
 const pending=useRef(null);
 const canCreate=session.capabilities?.some(p=>['returns','manage','admin'].includes(p));
 const canManage=session.capabilities?.some(p=>['manage','admin'].includes(p));
 const canFiscal=session.capabilities?.some(p=>['fiscalReview','manage','admin'].includes(p));
 const load=useCallback(async cursorValue=>{
  setBusy(true);setError('');
  try{const r=await client.adjustmentQuery({type:'list',occurrenceId:occurrence.id,limit:12,cursor:cursorValue},{refresh:true});
   setItems(v=>cursorValue?[...v,...r.items]:r.items);setCursor(r.next);
  }catch(e){setError(e.code||'QUERY_FAILED');}finally{setBusy(false);}
 },[client,occurrence.id]);
 useEffect(()=>{load(null);},[load,loading]);
 const initialize=()=>{pending.current=null;setForm({quantity:String(occurrence.quantity),
  type:TYPES[occurrence.reason]||ADJUSTMENT_TYPES[0],fiscalCandidate:'',});};
 const create=async e=>{e.preventDefault();setBusy(true);setError('');try{
  if(!pending.current)pending.current={id:'ADJ-'+crypto.randomUUID(),key:crypto.randomUUID()};
  const {id,key}=pending.current;
  await client.adjustmentCommand('CREATE',id,occurrence.id,0,{
   type:form.type,quantity:Number(form.quantity),fiscalCandidate:form.fiscalCandidate||null},key);
  pending.current=null;setForm(null);setLoading(x=>x+1);
 }catch(e){setError(e.code||'REQUEST_FAILED');}finally{setBusy(false);}};
 const open=async id=>{setBusy(true);setError('');try{
  const r=await client.adjustmentQuery({type:'detail',id},{refresh:true});
  setSelected(r.adjustment);
  const d=await client.adjustmentQuery({type:'representation',id,revision:r.adjustment.revision},{refresh:true});
  setRepresentation(d.representation);
 }catch(e){setError(e.code||'QUERY_FAILED');}finally{setBusy(false);}};
 const selectVersion=async revision=>{
  if(!selected)return;
  setBusy(true);setError('');
  try{const r=await client.adjustmentQuery({type:'representation',id:selected.id,revision},{refresh:true});setRepresentation(r.representation);}
  catch(e){setError(e.code||'QUERY_FAILED');}finally{setBusy(false);}
 };
 const advance=async next=>{if(!selected||reason.trim().length<5)return;
  setBusy(true);setError('');try{
   const type=['LEGAL_REVIEW_REQUIRED','INTERNALLY_REVIEWED'].includes(next)?'TRANSITION_FISCAL':'TRANSITION_COMMERCIAL';
   if(!pending.current)pending.current={key:crypto.randomUUID(),eventId:'EV-'+crypto.randomUUID()};
   await client.adjustmentCommand(type,selected.id,occurrence.id,selected.revision,{
    next,eventId:pending.current.eventId,reason},pending.current.key);
   pending.current=null;setReason('');setLoading(n=>n+1);await open(selected.id);
  }catch(e){setError(e.code||'REQUEST_FAILED');}finally{setBusy(false);}};
 return <section className="dist-commercial" data-testid="distribution-commercial">
  <div className="dist-commercial-heading"><div><h3>{t.title}</h3><p>{t.subtitle}</p></div><div className="dist-actionbar"><button disabled={busy} onClick={()=>load(null)}>{t.reload}</button>{canCreate&&<button className="primary" disabled={busy||!!form} onClick={initialize}>{t.new}</button>}</div></div>
  {error&&<p role="alert" className="dist-alert">{t.errors[error]||error}</p>}
  <p className="dist-commercial-caution">{t.pay}</p>
  {form&&<form onSubmit={create} className="dist-commercial-form">
   <label>{t.kind}<select value={form.type} onChange={e=>{setForm(v=>({...v,type:e.target.value}));pending.current=null;}}>{(TYPES_BY_OCCURRENCE[occurrence.reason]||[]).map(k=><option key={k} value={k}>{k.replaceAll('_',' ')}</option>)}</select></label>
   <label>{t.quantity}<input type="number" min="1" step="1" max={occurrence.quantity} value={form.quantity} required onChange={e=>{setForm(v=>({...v,quantity:e.target.value}));pending.current=null;}}/></label>
   <label>{t.fiscal}<select value={form.fiscalCandidate} onChange={e=>{setForm(v=>({...v,fiscalCandidate:e.target.value}));pending.current=null;}}><option value="">{t.none}</option>{FISCAL_CANDIDATES[occurrence.country]?.map(k=><option value={k} key={k}>{k.replaceAll('_',' ')}</option>)}</select></label>
   <div className="dist-actionbar"><button type="submit" disabled={busy} className="primary">{t.create}</button><button type="button" onClick={()=>setForm(null)}>{t.return}</button></div>
  </form>}
  {!items.length?<p>{t.empty}</p>:<div className="dist-commercial-list">{items.map(a=><button key={a.id} disabled={busy} onClick={()=>open(a.id)} className="dist-commercial-row"><span>{a.type.replaceAll('_',' ')} · {a.quantity}</span><strong>{distributionMoney(a.value)}</strong><small>{t.state[a.status]||a.status} · {t.view}</small></button>)}</div>}
  {cursor&&<button onClick={()=>load(cursor)} disabled={busy}>{t.next}</button>}
  {selected&&<div className="dist-commercial-review">
   <div className="dist-commercial-heading"><h4>{selected.id} · {t.state[selected.status]||selected.status}</h4><button disabled={busy} onClick={()=>{setSelected(null);setRepresentation(null);pending.current=null;}}>{t.return}</button></div>
   <p>{t.source}: {selected.saleId} · {selected.productId} · {selected.customerName||selected.customerId}</p>
   <p>{t.amount}: <strong>{distributionMoney(selected.value)}</strong> · {selected.quantity} / {selected.originalQuantity}</p>
   <p>{t.original}: {selected.documentOrigin?.reference||t.cannot}</p>
   <p>{t.pay}</p>
   <label>{t.reason}<textarea maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);pending.current=null;}}/></label>
   <div className="dist-actionbar">
    {canCreate&&selected.status==='DRAFT'&&<button disabled={busy||reason.trim().length<5} onClick={()=>advance('COMMERCIAL_REVIEW')}>{t.review}</button>}
    {canManage&&selected.status==='COMMERCIAL_REVIEW'&&<button disabled={busy||reason.trim().length<5} onClick={()=>advance('FISCAL_REVIEW')}>{t.fiscalReview}</button>}
    {canFiscal&&selected.status==='FISCAL_REVIEW'&&<button disabled={busy||reason.trim().length<5} onClick={()=>advance('LEGAL_REVIEW_REQUIRED')}>{t.legal}</button>}

    {canManage&&['DRAFT','COMMERCIAL_REVIEW'].includes(selected.status)&&<button disabled={busy||reason.trim().length<5} onClick={()=>advance('CANCELLED')}>{t.cancel}</button>}
    {(canManage||canFiscal)&&['COMMERCIAL_REVIEW','FISCAL_REVIEW','LEGAL_REVIEW_REQUIRED'].includes(selected.status)&&<button disabled={busy||reason.trim().length<5} onClick={()=>advance('REJECTED')}>{t.reject}</button>}
   </div>
   {representation&&<label className="dist-commercial-version">{t.version}
    <select disabled={busy} value={representation.revision}
     onChange={e=>selectVersion(Number(e.target.value))}>
     {Array.from({length:selected.revision+1},(_,i)=><option value={i} key={i}>v{i+1}</option>)}
    </select></label>}
   {representation&&<div className="dist-adjust-print" aria-label={t.view}>
    <h3>{INTERNAL_FISCAL_WARNING[language==='es'?'es':'pt']}</h3>
    <p>{t.view}: {representation.id} · v{representation.version}</p>
    <p>{t.source}: {representation.saleId} · {representation.occurrenceId}</p>
    <p>{representation.customerName||representation.customerId} · {representation.country}</p>
    <p>{representation.type} · {representation.quantity} · {distributionMoney(representation.value)}</p>
    <p>{t.status}: {t.state[representation.status]||representation.status} · {representation.createdBy}</p>
    <p>{t.original}: {representation.sourceDocument?.reference||t.cannot}</p>
    <button className="dist-print-action" onClick={()=>window.print()}>{t.print}</button>
   </div>}
  </div>}
 </section>;
}

import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {distributionMoney} from '../core/distribution/i18n.js';
import './DistributionOccurrences.css';
import DistributionCommercial from './DistributionCommercial.jsx';

const copy={
 pt:{title:'Ocorrências e Devoluções',subtitle:'Conferência logística, revisão fiscal e financeira independentes.',new:'Registrar ocorrência',order:'Pedido do PDV',line:'Produto',reason:'Motivo',quantity:'Quantidade',description:'Descrição da ocorrência',create:'Salvar ocorrência',list:'Ocorrências registradas',empty:'Nenhuma ocorrência neste período.',today:'Hoje',refresh:'Atualizar',close:'Fechar',next:'Próxima página',back:'Anterior',details:'Abrir detalhes',history:'Histórico de eventos',logistics:'Logística',fiscal:'Fiscal',financial:'Financeiro',review:'Iniciar conferência',confirm:'Confirmar ocorrência',discard:'Descartar ocorrência',requestFiscal:'Solicitar rascunho fiscal',draft:'Preparar rascunho interno',country:'País',type:'Documento',pending:'Pendente de revisão legal e fiscal',managerOnly:'A confirmação manual exige gestor autorizado.',errors:{DUPLICATE_FACT:'Já existe ocorrência para este fato.',FACT_CAPACITY_EXCEEDED:'Quantidade acima do limite comprovado.',MANUAL_REVIEW_MANAGER_REQUIRED:'Somente gestor pode confirmar fato sem prova logística.',EVIDENCE_FILE_INVALID:'Arquivo inválido ou acima de 1 MB.',EVIDENCE_MAGIC_INVALID:'Formato real do arquivo não corresponde ao declarado.',FORBIDDEN:'Operador sem autorização.',REVISION_CONFLICT:'Registro alterado; reabra para atualizar.',EVIDENCE_NOT_FOUND:'Evidência indisponível ou invalidada.'},evidences:'Evidências privadas',invalidateEvidence:'Invalidar evidência',invalidateReason:'Motivo da invalidação',cancelEvidence:'Cancelar',invalidated:'Invalidada',addEvidence:'Anexar evidência',downloadEvidence:'Baixar evidência',sizeLimit:'PNG, JPEG ou PDF de até 1 MB.',noOrigin:'Não há referência fiscal autorizada e comprovada vinculada a esta venda. Rascunho indisponível.',notIssued:'Nenhum documento foi transmitido ou autorizado.',blocked:'Ajustes financeiros e estoque estão bloqueados nesta etapa.',select:'Selecionar',loaded:'Dados confirmados no servidor.',source:'Vínculos da venda',origin:'Documento fiscal original',reasons:{PICKING_SHORTAGE:'Falta na separação',DELIVERY_SHORTAGE:'Falta na entrega',PARTIAL_DELIVERY:'Entrega parcial',DAMAGED:'Avaria',TOTAL_REFUSAL:'Recusa total',PARTIAL_REFUSAL:'Recusa parcial',LATER_RETURN:'Devolução posterior',WRONG_PRODUCT:'Produto incorreto',REPLACEMENT:'Substituição',LOSS:'Extravio',INVOICE_DELIVERY_MISMATCH:'Divergência da fatura'},states:{REPORTED:'Registrada',UNDER_REVIEW:'Em conferência',CONFIRMED:'Confirmada',RESOLVED:'Resolvida',DISMISSED:'Descartada',NOT_REQUESTED:'Não solicitado',DRAFT:'Rascunho',REVIEW_REQUIRED:'Revisão pendente',BLOCKED:'Bloqueado',REJECTED:'Rejeitado'}},
 es:{title:'Incidencias y Devoluciones',subtitle:'Verificación logística, fiscal y financiera independientes.',new:'Registrar incidencia',order:'Pedido del PDV',line:'Producto',reason:'Motivo',quantity:'Cantidad',description:'Descripción de la incidencia',create:'Guardar incidencia',list:'Incidencias registradas',empty:'No hay incidencias en este período.',today:'Hoy',refresh:'Actualizar',close:'Cerrar',next:'Página siguiente',back:'Anterior',details:'Abrir detalles',history:'Historial de eventos',logistics:'Logística',fiscal:'Fiscal',financial:'Financiero',review:'Iniciar verificación',confirm:'Confirmar incidencia',discard:'Descartar incidencia',requestFiscal:'Solicitar borrador fiscal',draft:'Preparar borrador interno',country:'País',type:'Documento',pending:'Pendiente de revisión legal y fiscal',managerOnly:'La confirmación manual requiere un gestor autorizado.',errors:{DUPLICATE_FACT:'Ya existe incidencia para este hecho.',FACT_CAPACITY_EXCEEDED:'Cantidad por encima del límite comprobado.',MANUAL_REVIEW_MANAGER_REQUIRED:'Solo un gestor puede confirmar un hecho sin prueba logística.',EVIDENCE_FILE_INVALID:'Archivo inválido o mayor que 1 MB.',EVIDENCE_MAGIC_INVALID:'El archivo no coincide con el formato declarado.',FORBIDDEN:'Operador sin autorización.',REVISION_CONFLICT:'Registro modificado; vuelva a abrirlo.',EVIDENCE_NOT_FOUND:'Evidencia no disponible o invalidada.'},evidences:'Evidencias privadas',invalidateEvidence:'Invalidar evidencia',invalidateReason:'Motivo de invalidación',cancelEvidence:'Cancelar',invalidated:'Invalidada',addEvidence:'Adjuntar evidencia',downloadEvidence:'Descargar evidencia',sizeLimit:'PNG, JPEG o PDF de hasta 1 MB.',noOrigin:'No existe referencia fiscal autorizada y comprobada para esta venta. Borrador no disponible.',notIssued:'Ningún documento fue transmitido ni autorizado.',blocked:'Ajustes financieros y de stock bloqueados en esta etapa.',select:'Seleccionar',loaded:'Datos confirmados en el servidor.',source:'Referencias de venta',origin:'Documento fiscal original',reasons:{PICKING_SHORTAGE:'Falta en preparación',DELIVERY_SHORTAGE:'Falta en entrega',PARTIAL_DELIVERY:'Entrega parcial',DAMAGED:'Avería',TOTAL_REFUSAL:'Rechazo total',PARTIAL_REFUSAL:'Rechazo parcial',LATER_RETURN:'Devolución posterior',WRONG_PRODUCT:'Producto incorrecto',REPLACEMENT:'Sustitución',LOSS:'Pérdida',INVOICE_DELIVERY_MISMATCH:'Diferencia con factura'},states:{REPORTED:'Registrada',UNDER_REVIEW:'En verificación',CONFIRMED:'Confirmada',RESOLVED:'Resuelta',DISMISSED:'Descartada',NOT_REQUESTED:'No solicitado',DRAFT:'Borrador',REVIEW_REQUIRED:'Revisión pendiente',BLOCKED:'Bloqueado',REJECTED:'Rechazado'}}
};
const documentTypes={PY:['NOTA_CREDITO_ELECTRONICA','NOTA_REMISION_ELECTRONICA','CANCELAMENTO_REQUEST'],BR:['NFE_DEVOLUCAO','NFE_ENTRADA','NFE_NOTA_CREDITO','CANCELAMENTO_REQUEST']};
const defaultForm={orderId:'',lineIndex:'0',reason:'DELIVERY_SHORTAGE',quantity:'1',description:''};
export default function DistributionOccurrences({client,session,range,language}){
 const t=copy[language==='es'?'es':'pt'],[rows,setRows]=useState([]),[next,setNext]=useState(null),[page,setPage]=useState(0),[cursors,setCursors]=useState([null]);
 const [orders,setOrders]=useState([]),[orderCursor,setOrderCursor]=useState(null),[detail,setDetail]=useState(null),[form,setForm]=useState(defaultForm),[creating,setCreating]=useState(false);
 const [evidenceFile,setEvidenceFile]=useState(null),[evidenceKind,setEvidenceKind]=useState('PHOTO'),[invalidateId,setInvalidateId]=useState(null),[invalidateReason,setInvalidateReason]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reload,setReload]=useState(0),[filterReason,setFilterReason]=useState(''),[filterState,setFilterState]=useState(''),[docType,setDocType]=useState('');
 const pendingCreate=useRef(null),pendingAction=useRef(null),pendingEvidence=useRef(null),dialogRef=useRef(null);
 const canManage=session.capabilities?.includes('manage')||session.capabilities?.includes('returns')||session.capabilities?.includes('admin');
 const canFiscal=session.capabilities?.includes('manage')||session.capabilities?.includes('admin')||session.capabilities?.includes('fiscalReview');
 const canInvalidate=session.capabilities?.includes('manage')||session.capabilities?.includes('admin');
 const localState=v=>t.states[v]||v;
 useEffect(()=>{
  if(!creating&&!detail)return;
  const previous=document.activeElement,dialog=dialogRef.current;
  dialog?.focus();
  const onKey=e=>{
   if(e.key==='Escape'&&!busy){e.preventDefault();setCreating(false);setDetail(null);return;}
   if(e.key!=='Tab'||!dialog)return;
   const focus=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[href]')];
   if(!focus.length)return;
   if(e.shiftKey&&document.activeElement===focus[0]){e.preventDefault();focus.at(-1).focus();}
   if(!e.shiftKey&&document.activeElement===focus.at(-1)){e.preventDefault();focus[0].focus();}
  };
  document.addEventListener('keydown',onKey);
  return()=>{document.removeEventListener('keydown',onKey);previous?.focus?.();};
 },[creating,detail?.id]);

 const load=useCallback(async()=>{setBusy(true);setError('');try{
  const r=await client.occurrenceQuery({type:'list',from:Date.parse(range.inicio),to:Date.parse(range.fim),limit:12,cursor:cursors[page]},{refresh:true});
  setRows(r.items);setNext(r.next);
 }catch(e){setError(e.code||'REQUEST_FAILED');}finally{setBusy(false);}},[client,range,page,cursors,reload]);
 useEffect(()=>{setPage(0);setCursors([null]);},[range]);
 useEffect(()=>{load();},[load]);
 const selectedOrder=useMemo(()=>orders.find(o=>o.id===form.orderId),[orders,form.orderId]);
 const selectedLine=selectedOrder?.itens?.[Number(form.lineIndex)];
 const fetchOrders=async(cursor=null)=>{setBusy(true);setError('');try{
  const r=await client.occurrenceQuery({type:'sourceOrders',from:Date.parse(range.inicio),to:Date.parse(range.fim),limit:12,cursor},{refresh:true});
  setOrders(prev=>cursor?[...prev,...r.items]:r.items);setOrderCursor(r.next);
 }catch(e){setError(e.code||'REQUEST_FAILED');}finally{setBusy(false);}};
 const open=async id=>{setBusy(true);setError('');try{const r=await client.occurrenceQuery({type:'detail',occurrenceId:id},{refresh:true});setDetail(r.occurrence);setDocType(documentTypes[r.occurrence.country]?.[0]||'');}catch(e){setError(e.code||'REQUEST_FAILED');}finally{setBusy(false);}};
 const create=async e=>{e.preventDefault();if(!selectedOrder||!selectedLine)return;setBusy(true);setError('');try{
  const signature=JSON.stringify([form,selectedOrder.id,selectedLine.produtoOriginalId]);
  if(pendingCreate.current?.signature!==signature){
   const id='OCC-'+crypto.randomUUID();pendingCreate.current={signature,id,key:crypto.randomUUID(),payload:{
    id,refs:{saleId:selectedOrder.id,orderId:selectedOrder.id,customerId:selectedOrder.clienteId,
     orderLineId:String(form.lineIndex),productId:selectedLine.produtoOriginalId},
    reason:form.reason,quantity:Number(form.quantity),description:form.description
   }};
  }
  const {id,key,payload}=pendingCreate.current;
  await client.occurrenceCommand('CREATE',id,0,payload,key);
  pendingCreate.current=null;
  setCreating(false);setForm(defaultForm);setNotice(t.loaded);setReload(n=>n+1);await open(id);
 }catch(e){setError(e.code||'REQUEST_FAILED');}finally{setBusy(false);}};
 const operate=async(type,payload)=>{if(!detail)return;setBusy(true);setError('');setNotice('');try{
  const signature=JSON.stringify([type,detail.id,detail.revision]);
  if(pendingAction.current?.signature!==signature)pendingAction.current={signature,key:crypto.randomUUID(),payload};
  await client.occurrenceCommand(type,detail.id,detail.revision,pendingAction.current.payload,pendingAction.current.key);
  pendingAction.current=null;
  await open(detail.id);setNotice(t.loaded);setReload(n=>n+1);
 }catch(e){setError(e.code||'REQUEST_FAILED');}finally{setBusy(false);}};
 const transition=(domain,next)=>operate('TRANSITION_'+domain.toUpperCase(),{next,eventId:'EV-'+crypto.randomUUID(),note:next,at:new Date().toISOString()});
 const fiscalDraft=()=>operate('DRAFT_FISCAL',{id:'DF-'+crypto.randomUUID(),eventId:'EV-'+crypto.randomUUID(),type:docType});
 const readFileBase64=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error('FILE_READ_FAILED'));
  reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
  reader.readAsDataURL(file);
 });
 const uploadEvidence=async()=>{
  if(!detail||!evidenceFile)return;
  setBusy(true);setError('');try{
   if(evidenceFile.size>1_000_000||evidenceFile.size<12)throw new Error('EVIDENCE_FILE_INVALID');
   if(!['image/png','image/jpeg','application/pdf'].includes(evidenceFile.type))throw new Error('EVIDENCE_FILE_INVALID');
   const signature=[detail.id,detail.revision,evidenceKind,evidenceFile.name,evidenceFile.size].join('|');
   if(pendingEvidence.current?.signature!==signature){
    pendingEvidence.current={signature,id:'EV-'+crypto.randomUUID(),key:crypto.randomUUID(),
     base64:await readFileBase64(evidenceFile)};
   }
   const {id,key,base64}=pendingEvidence.current;
   await client.occurrenceEvidenceUpload({
    id,key,occurrenceId:detail.id,expectedRevision:detail.revision,
    kind:evidenceKind,mediaType:evidenceFile.type,base64
   });
   pendingEvidence.current=null;setEvidenceFile(null);await open(detail.id);setNotice(t.loaded);setReload(n=>n+1);
  }catch(e){setError(e.code||e.message||'UPLOAD_FAILED');}finally{setBusy(false);}
 };
 const downloadEvidence=async item=>{
  setBusy(true);setError('');try{
   const response=await client.occurrenceEvidenceRead(detail.id,item.id);
   const binary=atob(response.base64),bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   const url=URL.createObjectURL(new Blob([bytes],{type:response.mediaType}));
   const anchor=document.createElement('a');
   anchor.href=url;anchor.download=item.id+'.'+(response.mediaType==='application/pdf'?'pdf':response.mediaType==='image/png'?'png':'jpg');
   document.body.append(anchor);anchor.click();anchor.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){setError(e.code||'EVIDENCE_NOT_FOUND');}finally{setBusy(false);}
 };
 const invalidateEvidence=async()=>{
  if(!detail||!invalidateId||invalidateReason.trim().length<6)return;
  setBusy(true);setError('');try{
   await client.occurrenceEvidenceInvalidate({
    occurrenceId:detail.id,id:invalidateId,expectedRevision:detail.revision,reason:invalidateReason
   });
   setInvalidateId(null);setInvalidateReason('');await open(detail.id);
   setNotice(t.loaded);setReload(n=>n+1);
  }catch(e){setError(e.code||'INVALIDATION_FAILED');}finally{setBusy(false);}
 };
 const results=rows.filter(o=>(!filterReason||o.reason===filterReason)&&(!filterState||Object.values(o.states).includes(filterState)));
 return <section className="dist-occ" data-testid="distribution-occurrences">
  <div className="dist-occ-heading"><div><span className="dist-eyebrow">ZENOS · {t.country} BR / PY</span><h2>{t.title}</h2><p>{t.subtitle}</p></div><div className="dist-actionbar"><button disabled={busy} onClick={()=>{client.invalidate();load();}}>{t.refresh}</button>{canManage&&<button className="primary" disabled={busy} onClick={()=>{setCreating(true);setOrders([]);setForm(defaultForm);fetchOrders();}}>{t.new}</button>}</div></div>
  {error&&<div role="alert" className="dist-alert">{t.errors?.[error]||error}</div>}{notice&&<div role="status" className="dist-success">{notice}</div>}
  <div className="dist-occ-filters"><label>{t.reason}<select value={filterReason} onChange={e=>setFilterReason(e.target.value)}><option value="">{t.select}</option>{Object.entries(t.reasons).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>{t.logistics} / {t.fiscal}<select value={filterState} onChange={e=>setFilterState(e.target.value)}><option value="">{t.select}</option>{Object.entries(t.states).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>
  <div className="dist-card dist-occ-list"><h3>{t.list}</h3>{!results.length?<div className="dist-empty">{busy?'…':t.empty}</div>:<div className="dist-occ-grid">{results.map(o=><button key={o.id} className="dist-occ-item" onClick={()=>open(o.id)} disabled={busy}><strong>{t.reasons[o.reason]} · {o.refs.saleId}</strong><small>{new Date(o.createdAt).toLocaleString(language==='es'?'es-PY':'pt-BR')} · {o.quantity} · {distributionMoney(o.originalAmount)}</small><span className="dist-occ-states"><span>{localState(o.states.logistics)}</span><span>{localState(o.states.fiscal)}</span><span>{localState(o.states.financial)}</span></span><small>{t.details}</small></button>)}</div>}<div className="dist-pagination"><button disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>{t.back}</button><span>{page+1}</span><button disabled={busy||!next} onClick={()=>{setCursors(c=>[...c.slice(0,page+1),next]);setPage(p=>p+1);}}>{t.next}</button></div></div>
  {creating&&<div className="dist-occ-shade"><form ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1} className="dist-dialog dist-occ-dialog" onSubmit={create} aria-label={t.new}><div className="dist-occ-heading"><h2>{t.new}</h2><button type="button" onClick={()=>setCreating(false)}>{t.close}</button></div>
   <label>{t.order}<select required value={form.orderId} onChange={e=>setForm(f=>({...f,orderId:e.target.value,lineIndex:'0'}))}><option value="">{t.select}</option>{orders.map(o=><option key={o.id} value={o.id}>{o.id} · {o.clienteNome}</option>)}</select></label>
   {orderCursor&&<button type="button" disabled={busy} onClick={()=>fetchOrders(orderCursor)}>{t.next}</button>}
   <label>{t.line}<select required value={form.lineIndex} onChange={e=>setForm(f=>({...f,lineIndex:e.target.value}))}>{selectedOrder?.itens?.map((item,i)=><option key={i} value={String(i)}>{item.nome} · {item.qtd}</option>)}</select></label>
   <label>{t.reason}<select value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}>{Object.entries(t.reasons).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label>{t.quantity}<input type="number" min="1" max={selectedLine?.qtd||1} step="1" required value={form.quantity} onChange={e=>setForm(f=>({...f,quantity:e.target.value}))}/></label>
   <label>{t.description}<textarea required maxLength={1000} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></label><p>{t.blocked}</p><button className="primary" disabled={busy||!selectedLine}>{t.create}</button>
  </form></div>}
  {detail&&<div className="dist-occ-shade"><div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" className="dist-dialog dist-occ-dialog" aria-label={t.details}><div className="dist-occ-heading"><div><span className="dist-eyebrow">{detail.id} · {detail.country}</span><h2>{t.reasons[detail.reason]}</h2></div><button onClick={()=>setDetail(null)}>{t.close}</button></div>
    <p>{detail.description}</p><p>{t.source}: {detail.refs.saleId} · {detail.refs.productId} · {detail.refs.customerId}</p><p>{t.quantity}: {detail.quantity} · {distributionMoney(detail.originalAmount)}</p>
    <div className="dist-occ-status"><article><small>{t.logistics}</small><strong>{localState(detail.states.logistics)}</strong>{canManage&&detail.states.logistics==='REPORTED'&&<button disabled={busy} onClick={()=>transition('logistics','UNDER_REVIEW')}>{t.review}</button>}{canManage&&detail.states.logistics==='UNDER_REVIEW'&&<>{(detail.sourceKind==='TRIP'||session.capabilities?.includes('manage')||session.capabilities?.includes('admin'))?<button className="primary" disabled={busy} onClick={()=>transition('logistics','CONFIRMED')}>{t.confirm}</button>:<p>{t.managerOnly}</p>}<button disabled={busy} onClick={()=>transition('logistics','DISMISSED')}>{t.discard}</button></>}</article>
     <article><small>{t.fiscal}</small><strong>{localState(detail.states.fiscal)}</strong>{canFiscal&&detail.states.logistics==='CONFIRMED'&&detail.states.fiscal==='NOT_REQUESTED'&&<button disabled={busy} onClick={()=>transition('fiscal','DRAFT')}>{t.requestFiscal}</button>}
      {canFiscal&&['DRAFT','REVIEW_REQUIRED'].includes(detail.states.fiscal)&&detail.fiscalOriginal&&<><label>{t.type}<select value={docType} onChange={e=>setDocType(e.target.value)}>{documentTypes[detail.country]?.map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label><button disabled={busy||!docType} onClick={fiscalDraft}>{t.draft}</button></>}{!detail.fiscalOriginal&&<p>{t.noOrigin}</p>}<p>{t.notIssued}</p></article>
     <article><small>{t.financial}</small><strong>{localState(detail.states.financial)}</strong><p>{t.blocked}</p></article></div>
    {detail.states.logistics==='CONFIRMED'&&<DistributionCommercial client={client} occurrence={detail} session={session} language={language}/>}
    <div className="dist-occ-evidence">
     <h3>{t.evidences}</h3>
     {canManage&&<div className="dist-occ-evidence-controls"><label>{t.evidences}
       <input type="file" accept="image/png,image/jpeg,application/pdf" disabled={busy}
        onChange={e=>{setEvidenceFile(e.target.files?.[0]||null);pendingEvidence.current=null;}}/>
      </label><label>{t.select}<select value={evidenceKind} onChange={e=>{setEvidenceKind(e.target.value);pendingEvidence.current=null;}}>
       <option value="PHOTO">Foto</option><option value="SIGNATURE">{language==='es'?'Firma':'Assinatura'}</option>
       <option value="DOCUMENT">Documento</option></select></label>
      <button disabled={busy||!evidenceFile} onClick={uploadEvidence}>{t.addEvidence}</button>
     </div>}
     <p>{t.sizeLimit}</p>
     {(detail.evidence||[]).map(item=>
      <div key={item.id} className="dist-occ-evidence-item">
       <span>{item.kind} · {item.id} · {item.status==='INVALIDATED'?t.invalidated:item.bytes+' bytes'}</span>
       {item.status==='ACTIVE'&&<div className="dist-actionbar">
        <button disabled={busy} onClick={()=>downloadEvidence(item)}>{t.downloadEvidence}</button>
        {canInvalidate&&<button disabled={busy} className="danger" onClick={()=>{setInvalidateId(item.id);setInvalidateReason('');}}>{t.invalidateEvidence}</button>}
       </div>}
      </div>)}
     {invalidateId&&<div className="dist-confirm">
      <label>{t.invalidateReason}<textarea required minLength={6} maxLength={300}
       value={invalidateReason} onChange={e=>setInvalidateReason(e.target.value)}/></label>
      <div className="dist-actionbar"><button className="danger" disabled={busy||invalidateReason.trim().length<6} onClick={invalidateEvidence}>{t.invalidateEvidence}</button>
       <button disabled={busy} onClick={()=>setInvalidateId(null)}>{t.cancelEvidence}</button></div>
     </div>}
    </div>
    <h3>{t.history}</h3><div className="dist-occ-events">{detail.history.map(e=><p key={e.eventId}>{new Date(e.at).toLocaleString(language==='es'?'es-PY':'pt-BR')} · {e.actorId} · {e.domain} · {localState(e.to)}</p>)}</div>
    {!!detail.fiscalDocuments.length&&<div className="dist-occ-events"><h3>{t.pending}</h3>{detail.fiscalDocuments.map(d=><p key={d.id}>{d.type} · {d.originalDocument.reference} · {localState(d.status)}</p>)}</div>}
   </div></div>}
 </section>;
}

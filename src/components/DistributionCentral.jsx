import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {signInWithEmailAndPassword,onAuthStateChanged,sendPasswordResetEmail,signOut} from 'firebase/auth';
import {auth,ZENOS_RUNTIME} from '../firebase.js';
import {zenosStorage} from '../core/storage.js';
import {useUiLanguage} from '../core/useUiLanguage.js';
import {distributionPeriod} from '../core/distribution/period.js';
import {createDistributionClient} from '../core/distribution/client.js';
import {distributionText,distributionMoney} from '../core/distribution/i18n.js';
import {manifestForCustomer,summarizeManifest} from '../core/distribution/domain.js';
import {guidedLoadStage,guidedLoadStatus,guidedFullCheck,guidedTruckReady} from '../core/distribution/guidedLoad.js';
import './DistributionCentral.css';
import distributionPrintCss from './DistributionCentral.css?inline';
const DistributionTrips=React.lazy(()=>import('./DistributionTrips.jsx'));
const DistributionOccurrences=React.lazy(()=>import('./DistributionOccurrences.jsx'));
const codeOf=e=>e?.code||'REQUEST_FAILED';
const remainingOrderQuantity=(order,index)=>Math.max(0,Number(order.itens[index].qtd)-(order._distribution?.allocated?.[index]||0));
export default function DistributionCentral({operatorId:initialOperatorId='admin',idioma:externalLanguage}) {
 const [localLanguage,setLanguage]=useUiLanguage(zenosStorage),language=externalLanguage||localLanguage;
 const t=useMemo(()=>distributionText(language),[language]);
 const [user,setUser]=useState(auth.currentUser),[session,setSession]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [scope,setScope]=useState('stock');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[operatorId,setOperatorId]=useState(initialOperatorId),[pin,setPin]=useState('');
 const verifyAcceptance=ZENOS_RUNTIME.isStaging&&new URLSearchParams(window.location.search).has('verificar-entrega-c');
 const [acceptanceResult,setAcceptanceResult]=useState('');
 const ownerSetup=ZENOS_RUNTIME.isStaging&&new URLSearchParams(window.location.search).has('ativar');
 const [settingOwnerPin,setSettingOwnerPin]=useState(ownerSetup);
 const client=useMemo(()=>user?createDistributionClient(user):null,[user]);
 const [tab,setTab]=useState('loads'),[period,setPeriod]=useState('hoje'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[range,setRange]=useState(()=>distributionPeriod('hoje'));
 const [page,setPage]=useState(0),[cursors,setCursors]=useState([null]),[rows,setRows]=useState([]),[next,setNext]=useState(null),[counts,setCounts]=useState({}),[loading,setLoading]=useState(false),[reload,setReload]=useState(0);
 const [selection,setSelection]=useState({}),[detail,setDetail]=useState(null),[document,setDocument]=useState(null),[copy,setCopy]=useState(false),[confirm,setConfirm]=useState(null);
 const [vehicle,setVehicle]=useState(''),[driver,setDriver]=useState(''),[route,setRoute]=useState(''),[checked,setChecked]=useState({}),[checkReason,setCheckReason]=useState(''),[truck,setTruck]=useState({}),[customerDocument,setCustomerDocument]=useState('');
 const [physicalChecked,setPhysicalChecked]=useState(false),[physicalLoaded,setPhysicalLoaded]=useState(false);
 const epoch=useRef(0),dialogRef=useRef(null),previousFocus=useRef(null);
 useEffect(()=>onAuthStateChanged(auth,u=>{setUser(u);setSession(null);setDetail(null);setRows([]);setSelection({});}),[]);
 useEffect(()=>()=>client?.clear(),[client]);
 const fail=useCallback(e=>{const code=codeOf(e);setError(code);if(['SESSION_EXPIRED','FORBIDDEN','UNAUTHENTICATED'].includes(code)){client?.clear();setSession(null);}},[client]);
 const queryInput=useMemo(()=>tab==='loads'?{type:'loads',from:Date.parse(range?.inicio),to:Date.parse(range?.fim),limit:12,cursor:cursors[page]}:{type:'orders',from:Date.parse(range?.inicio),to:Date.parse(range?.fim),limit:12,cursor:cursors[page]},[tab,range,cursors,page]);
 useEffect(()=>{
  if(!session||!client||!range||['trips','occurrences'].includes(tab)||session.scope==='driver'||session.scope==='trip')return;
  const controller=new AbortController(),current=++epoch.current;setLoading(true);setError('');
  client.query(queryInput,{signal:controller.signal,refresh:false}).then(result=>{if(epoch.current===current){setRows(result.items);setNext(result.next);}}).catch(e=>{if(e.name!=='AbortError'&&epoch.current===current)fail(e);}).finally(()=>{if(epoch.current===current)setLoading(false);});
  return ()=>{++epoch.current;controller.abort();};
 },[client,session,queryInput,reload,fail,range,tab]);
 useEffect(()=>{
  if(!session||!client||!range||['trips','occurrences'].includes(tab)||session.scope==='driver'||session.scope==='trip')return;
  const controller=new AbortController();
  client.query({type:'summary',from:Date.parse(range.inicio),to:Date.parse(range.fim)},{signal:controller.signal,refresh:false}).then(result=>setCounts(result.counts)).catch(e=>{if(e.name!=='AbortError'&&e.code!=='INVALID_PERIOD')fail(e);});
  return ()=>controller.abort();
 },[client,session,range,reload,fail,tab]);
 // Modal focus remains trapped and returns to its invoking control.
 useEffect(()=>{
  if(!detail)return;
  previousFocus.current=window.document.activeElement;dialogRef.current?.focus();
  const onKey=e=>{
   if(e.key==='Escape'&&!busy){setDetail(null);setDocument(null);setConfirm(null);}
   if(e.key==='Tab'){
    const nodes=[...dialogRef.current.querySelectorAll('button:not(:disabled),input,select,[tabindex="0"]')];
    if(!nodes.length)return;
    if(e.shiftKey&&(window.document.activeElement===nodes[0]||window.document.activeElement===dialogRef.current)){e.preventDefault();nodes.at(-1).focus();}
    else if(!e.shiftKey&&window.document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}
   }
  };
  window.document.addEventListener('keydown',onKey);return ()=>{window.document.removeEventListener('keydown',onKey);previousFocus.current?.focus();};
 },[!!detail,busy]);
 const resetPages=()=>{setPage(0);setCursors([null]);setSelection({});setRows([]);};
 function choosePeriod(value){setPeriod(value);if(value==='personalizado')return;setRange(distributionPeriod(value,Date.now(),session?.timeZone));resetPages();}
 async function resetOwnerPassword(){
  setBusy(true);setError('');setNotice('');
  try{await sendPasswordResetEmail(auth,email.trim());setNotice('ownerResetSent');}
  catch{setError('ownerResetFailed');}finally{setBusy(false);}
 }
 async function login(e){e.preventDefault();setBusy(true);setError('');try{
  const account=user||((await signInWithEmailAndPassword(auth,email,password)).user);
  // Authentication callback can change user during email login; the local client
  // is returned as state after one render. Server operator login is then explicit.
  if(!user){setPassword('');setUser(account);setNotice('secure');return;}
  if(settingOwnerPin){
   const response=await fetch('/__distribution/owner-pin',{method:'POST',headers:{'Content-Type':'application/json',
    Authorization:'Bearer '+await account.getIdToken(true)},body:JSON.stringify({pin}),cache:'no-store'});
   const result=await response.json();
   if(!response.ok&&result.error!=='OWNER_PIN_ALREADY_SET'){setError(result.error==='INVALID_PIN'?'ownerInvalidPin':'ownerVerification');return;}
   setOperatorId('admin');setPin('');setSettingOwnerPin(false);setNotice(response.ok?'ownerPinSaved':'ownerPinAlreadySet');return;
  }
  const result=await client.login(operatorId,pin,scope);setSession(result);setTab(result.scope==='trip'||result.scope==='driver'?'trips':'loads');setRange(distributionPeriod('hoje',Date.now(),result.timeZone));setPin('');setPassword('');setNotice('');
 }catch(e){if(user)fail(e);else setError(t(codeOf(e))===t('error')?'AUTH_SIGN_IN_FAILED':codeOf(e));}finally{setBusy(false);}}
 async function openLoad(loadId){setBusy(true);setError('');try{const result=await client.query({type:'detail',loadId},{refresh:true});setDetail(result.load);setChecked({});setCheckReason('');setTruck({});setPhysicalChecked(false);setPhysicalLoaded(false);setDocument(null);setConfirm(null);setVehicle(result.load.manifestVersions.at(-1)?.vehicle||'');setDriver(result.load.manifestVersions.at(-1)?.driver||'');setRoute(result.load.manifestVersions.at(-1)?.route||'');}catch(e){fail(e);}finally{setBusy(false);}}
 async function operate(type,payload={}){if(!detail||busy)return;setBusy(true);setError('');setNotice('');try{
  await client.command(type,detail.id,detail.revision,payload);const result=await client.query({type:'detail',loadId:detail.id},{refresh:true});setDetail(result.load);setNotice('saved');setConfirm(null);setReload(n=>n+1);
 }catch(e){fail(e);}finally{setBusy(false);}}
 // Re-read the authoritative load after every accepted command. If one action fails,
 // stop without issuing the next; the last confirmed state remains usable.
 async function guidedCommands(steps){
  if(!detail||busy)return;
  setBusy(true);setError('');setNotice('');
  let current=detail;
  try{
   for(const step of steps){
    await client.command(step.type,current.id,current.revision,step.payload||{});
    const response=await client.query({type:'detail',loadId:current.id},{refresh:true});
    current=response.load;setDetail(current);
   }
   setNotice('saved');setReload(n=>n+1);
  }catch(e){
   // Never replay a command automatically after a lost acknowledgment.
   // A fresh read reconciles the visible state without writing.
   try{const response=await client.query({type:'detail',loadId:current.id},{refresh:true});setDetail(response.load);}catch{}
   fail(e);
  }finally{setBusy(false);}
 }
 const guided=guidedLoadStatus(detail);
 const checkResult=detail?guidedFullCheck(detail.lines,checked,checkReason):{valid:false,full:false,quantities:[],reason:''};
 const labels=language==='es'
  ?['Preparar carga','Conferir mercancías','Preparar salida','Expedir carga']
  :['Preparar carga','Conferir mercadorias','Preparar saída','Expedir carga'];
 const words=language==='es'?{
  start:'Reservar y comenzar separación',check:'Confirmar conferencia',checkAll:'Marcar todas las cantidades',checkAttest:'Confirmo que conté físicamente los productos.',
  finalizeCheck:'Confirmar y aprobar conferencia',truck:'Carga física en el vehículo',truckAll:'Usar las cantidades conferidas',
  truckAttest:'Confirmo que la mercancía fue colocada físicamente en el vehículo.',truckConfirm:'Confirmar carga física',
  manifest:'Emitir documento de carga',dispatch:'Confirmar salida del vehículo',advanced:'Detalles técnicos y operaciones excepcionales',
  history:'Historial y versiones',next:'Próxima acción',complete:'Salida confirmada',part:'Existe una diferencia: indique el motivo y solicite aprobación.'
 }:{
  start:'Reservar e iniciar separação',check:'Confirmar conferência',checkAll:'Preencher quantidades previstas',checkAttest:'Confirmo que contei fisicamente os produtos.',
  finalizeCheck:'Confirmar e aprovar conferência',truck:'Mercadorias colocadas no caminhão',truckAll:'Usar quantidades conferidas',
  truckAttest:'Confirmo que as mercadorias foram fisicamente colocadas no veículo.',truckConfirm:'Confirmar carregamento físico',
  manifest:'Emitir romaneio para conferência',dispatch:'Confirmar saída do veículo',advanced:'Detalhes técnicos e operações excepcionais',
  history:'Histórico e versões',next:'Próxima ação',complete:'Saída confirmada',part:'Há divergência: informe o motivo e solicite aprovação.'
 };
 async function create(){setBusy(true);setError('');try{
  const selections=Object.values(selection).flatMap(s=>s.items.map((item,index)=>({orderId:s.order.id,lineIndex:index,quantity:item})).filter(s=>s.quantity>0));
  // Keep a stable ID if a network response is lost. The client retains the command key.
  const identity=JSON.stringify(selections);
  if(createAttempt.current?.identity!==identity)createAttempt.current={identity,loadId:`C-${crypto.randomUUID().slice(0,12)}`};
  const result=await client.command('CREATE',createAttempt.current.loadId,0,{selections});setSelection({});createAttempt.current=null;setNotice('saved');setTab('loads');resetPages();setReload(n=>n+1);await openLoad(result.loadId);
 }catch(e){fail(e);}finally{setBusy(false);}}
 const createAttempt=useRef(null);
 async function showVersion(version){setBusy(true);setError('');try{const result=await client.query({type:'manifest',loadId:detail.id,version});setCustomerDocument('');setDocument(result.document);setCopy(true);}catch(e){fail(e);}finally{setBusy(false);}}
 async function download(){setBusy(true);setError('');try{const {manifestPdf}=await import('../core/distribution/pdf.js');const pdf=await manifestPdf(customerDocument?manifestForCustomer(document,customerDocument):document,{language,copy});const url=URL.createObjectURL(pdf.blob),a=window.document.createElement('a');a.href=url;a.download=pdf.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){fail(e);}finally{setBusy(false);}}
 const date=value=>new Date(value).toLocaleString(language==='es'?'es-PY':'pt-BR');
 if(!ZENOS_RUNTIME.isHomologacao&&!ZENOS_RUNTIME.isStaging)return <p>{t('safety')}</p>;
 return <section className="dist" data-testid="distribution-central" lang={language==='es'?'es-PY':'pt-BR'}>
  <header className="dist-top"><img src="/logo-zenos.png?v=4" alt="ZenOS"/><div className="dist-top-actions"><span className="dist-env">{t('homolog')}</span>{!externalLanguage&&<select aria-label="Idioma" value={localLanguage} onChange={e=>setLanguage(e.target.value)}><option value="pt">Português</option><option value="es">Español</option></select>}{session&&<button disabled={busy} onClick={async()=>{setBusy(true);try{await client.logout();setSession(null);setDetail(null);setSelection({});setRows([]);}catch(e){fail(e);}finally{setBusy(false);}}}>{t('logout')}</button>}</div></header>
  {(!session||session.scope!=='driver')&&<div className="dist-hero"><div><span className="dist-eyebrow">ZENOS · LOGÍSTICA</span><h1>{t('title')}</h1><p>{t('subtitle')}</p></div>{session&&<span className="dist-operator">{session.operatorName}</span>}</div>}
  {error&&<div className="dist-alert" role="alert">{t(error)} <button disabled={busy} onClick={()=>{setReload(n=>n+1);if(detail)openLoad(detail.id);}}>{t('retry')}</button></div>}
  {verifyAcceptance&&<div className="dist-card">
   {user&&<button type="button" disabled={busy} onClick={async()=>{setAcceptanceResult('');await signOut(auth);}}>{t('acceptanceFreshLogin')}</button>}
   {session&&<button type="button" disabled={busy} onClick={async()=>{
    setBusy(true);setAcceptanceResult('');
    try{
     const result=await client.routeQuery({type:'delivery-c-acceptance'},{refresh:true});
     setAcceptanceResult(result.eligible?'acceptanceEligible':'acceptanceIneligible');
    }catch{setAcceptanceResult('acceptanceIneligible');}finally{setBusy(false);}
   }}>{t('acceptanceVerify')}</button>}
   {acceptanceResult&&session&&<p role="status">{t(acceptanceResult)}</p>}
  </div>}
  {notice&&<div className="dist-success" role="status">{t(notice)}</div>}
  {!session?<form className="dist-login dist-card" onSubmit={login}><span className="dist-eyebrow">{t('secure')}</span><h2>{t('login')}</h2><p>{t('loginHelp')}</p>{!user&&<><label>{t('email')}<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>{t('password')}<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label></>}{user&&<><label>{language==='es'?'Modo de acceso':'Modo de acesso'}<select aria-label={language==='es'?'Modo de acceso':'Modo de acesso'} value={scope} onChange={e=>setScope(e.target.value)}><option value='stock'>{language==='es'?'Depósito y cargas':'Depósito e cargas'}</option><option value='trip'>{language==='es'?'Gestión de viajes':'Gestão de viagens'}</option><option value='driver'>{language==='es'?'Mi ruta · conductor':'Minha rota · motorista'}</option></select></label><label>{t('operator')}<input required value={operatorId} onChange={e=>setOperatorId(e.target.value)} autoComplete="off"/></label><label>{t(settingOwnerPin?'ownerNewPin':'pin')}<input type="password" required inputMode="numeric" pattern={settingOwnerPin?'[0-9]{8,12}':undefined} aria-describedby={settingOwnerPin?'dist-owner-pin-hint':undefined} autoComplete="off" value={pin} onChange={e=>setPin(e.target.value)}/></label>{settingOwnerPin&&<small id="dist-owner-pin-hint" className="dist-field-hint">{t('ownerInvalidPin')}</small>}</>}<button className="primary" disabled={busy}>{busy?t('loading'):t(settingOwnerPin&&user?'ownerSavePin':'login')}</button>{ownerSetup&&!user&&<button type="button" disabled={busy||!email.trim()} onClick={resetOwnerPassword}>{t('ownerReset')}</button>}</form>:<>
   <div className="dist-toolbar dist-period-toolbar"><div className="dist-segments dist-period-options" role="group" aria-label={t('date')}>{[['hoje','today'],['mes','month'],['anterior','previous'],['personalizado','custom']].map(([value,key])=><button key={value} aria-pressed={period===value} onClick={()=>choosePeriod(value)}>{t(key)}</button>)}</div>{!['trips','occurrences'].includes(tab)&&session.scope==='stock'&&<button disabled={busy||loading} onClick={()=>{client.invalidate();setReload(n=>n+1);}}>{t('refresh')}</button>}</div>
   {period==='personalizado'&&<form className="dist-custom" onSubmit={e=>{e.preventDefault();let value;try{value=distributionPeriod('personalizado',Date.now(),session?.timeZone,from,to);}catch{setError('periodInvalid');return;}if(!value||Date.parse(value.fim)-Date.parse(value.inicio)>366*86400000){setError('periodInvalid');return;}setRange(value);resetPages();}}><label>{t('from')}<input type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label><label>{t('to')}<input type="date" required value={to} onChange={e=>setTo(e.target.value)}/></label><button>{t('apply')}</button></form>}
   {session.scope!=='driver'&&<nav className='dist-segments dist-area-nav' aria-label='Área logística'>{session.scope==='stock'&&<button aria-pressed={tab==='loads'||tab==='orders'} onClick={()=>{setTab('loads');resetPages();}}>{language==='es'?'Depósito y cargas':'Depósito e cargas'}</button>}{session.capabilities?.some(c=>['manage','returns','finance','driver','admin','fiscalReview'].includes(c))&&<button aria-pressed={tab==='trips'||(session.scope==='trip'&&tab!=='occurrences')} onClick={()=>{setTab('trips');resetPages();}}>{language==='es'?'Viajes y entregas':'Viagens e entregas'}</button>}{session.capabilities?.some(c=>['returns','manage','admin','fiscalReview'].includes(c))&&<button aria-pressed={tab==='occurrences'} onClick={()=>{setTab('occurrences');resetPages();}}>{language==='es'?'Incidencias y devoluciones':'Ocorrências e devoluções'}</button>}</nav>}
   {(tab==='trips'||session.scope==='driver'||(session.scope==='trip'&&tab!=='occurrences'))?<React.Suspense fallback={<p>{t('loading')}</p>}><DistributionTrips client={client} session={session} user={user} language={language} range={range}/></React.Suspense>:tab==='occurrences'?<React.Suspense fallback={<p>{t('loading')}</p>}><DistributionOccurrences client={client} session={session} range={range} language={language}/></React.Suspense>:<>
   <div className="dist-kpis">{[['waiting',(counts.DRAFT||0)+(counts.PLANNED||0)],['picking',counts.LOADING||0],['ready',(counts.LOADED||0)+(counts.APPROVED||0)],['onRoute',counts.DISPATCHED||0]].map(([label,value])=><div className="dist-card" key={label}><span>{t(label)}</span><strong>{value}</strong><small>{t(period==='hoje'?'today':period==='mes'?'month':period==='anterior'?'previous':'custom')}</small></div>)}</div>
   <div className="dist-card dist-board" data-view={tab}><div className="dist-board-head"><div className="dist-segments" role="group" aria-label={t('title')}>{['loads','orders'].map(value=><button key={value} aria-pressed={tab===value} onClick={()=>{setTab(value);resetPages();}}>{t(value)}</button>)}</div>{tab==='orders'&&<button className="primary" disabled={busy||!Object.values(selection).some(({items})=>items.some(quantity=>quantity>0))} onClick={create}>{t('newLoad')} {Object.keys(selection).length>0&&`(${Object.keys(selection).length})`}</button>}</div>
    {loading?<div role="status" className="dist-skeleton">{t('loading')}</div>:!rows.length?<div className="dist-empty">{t('empty')}</div>:<div className="dist-table-wrap"><table><thead><tr>{tab==='loads'?<><th>{t('number')}</th><th>{t('date')}</th><th>{t('state')}</th><th>{t('items')}</th><th>{t('actions')}</th></>:<><th>{t('select')}</th><th>{t('order')}</th><th>{t('customer')}</th><th>{t('seller')}</th><th>{t('partial')}</th></>}</tr></thead><tbody>{rows.map(row=>tab==='loads'?<tr key={row.id}><td data-label={t('number')}><strong>{row.id}</strong><small>v{row.revision}</small></td><td data-label={t('date')}>{date(row.createdAt)}</td><td data-label={t('state')}><span className={`dist-badge ${row.state.toLowerCase()}`}>{t(row.state)}</span></td><td data-label={t('items')}>{row.linesCount}</td><td><button disabled={busy} onClick={()=>openLoad(row.id)}>{t('open')}</button></td></tr>:<tr key={row.id}><td><input aria-label={`${t('select')} ${row.id}`} type="checkbox" disabled={!row.itens.some((_,index)=>remainingOrderQuantity(row,index)>0)} checked={!!selection[row.id]} onChange={e=>setSelection(s=>{const n={...s};if(e.target.checked)n[row.id]={order:row,items:row.itens.map((_,i)=>remainingOrderQuantity(row,i))};else delete n[row.id];return n;})}/></td><td data-label={t('order')}><strong>{row.id}</strong><small>{row.moedaDocumento}</small>{!row.itens.some((_,index)=>remainingOrderQuantity(row,index)>0)&&<small>{t('orderFullyAllocated')}</small>}</td><td data-label={t('customer')}>{row.clienteNome}</td><td data-label={t('seller')}>{row.vendedorId}</td><td data-label={t('partial')}>{row.itens.map((item,i)=>{const available=remainingOrderQuantity(row,i);return <label key={i} className="dist-item-qty">{item.nome}<input type="number" aria-label={`${t('quantity')} ${row.id} ${i}`} min="0" max={available} step="1" disabled={!selection[row.id]} value={selection[row.id]?.items[i]??available} onChange={e=>{const value=Number(e.target.value);setSelection(s=>({...s,[row.id]:{...s[row.id],items:s[row.id].items.map((n,j)=>j===i?value:n)}}));}}/></label>;})}</td></tr>)}</tbody></table></div>}
    <div className="dist-pagination"><button disabled={page===0||loading} onClick={()=>setPage(n=>n-1)}>{t('back')}</button><span>{t('page')} {page+1}</span><button disabled={!next||loading} onClick={()=>{setCursors(c=>[...c.slice(0,page+1),next]);setPage(n=>n+1);}}>{t('next')}</button></div>
   </div><p className="dist-footnote">{t('stockNote')} {t('originLock')}</p></>}
  </>}
  {detail&&<div className="dist-overlay"><div className="dist-dialog" role="dialog" aria-modal="true" aria-labelledby="dist-dialog-title" tabIndex="-1" ref={dialogRef}>
   <div className="dist-detail-head"><div><span className="dist-eyebrow">{t('loadDetail')}</span><h2 id="dist-dialog-title">{detail.id}</h2><span className={`dist-badge ${detail.state.toLowerCase()}`}>{t(detail.state)}</span></div><button disabled={busy} onClick={()=>{setDetail(null);setDocument(null);setConfirm(null);}}>{t('close')}</button></div>
   {error&&<p role="alert" className="dist-alert">{t(error)}</p>}{notice&&<p role="status" className="dist-success">{t(notice)}</p>}
   <div className="dist-guided-heading">
    <div><span className="dist-eyebrow">{language==='es'?'FLUJO GUIADO':'FLUXO GUIADO'}</span><h3>{detail.state==='DISPATCHED'?words.complete:labels[Math.min(guided.step,3)]}</h3>
    <p>{language==='es'?'Solo se muestra la siguiente acción necesaria.':'Apenas a próxima ação necessária fica em destaque.'}</p></div>
    <strong>{detail.state==='DISPATCHED'?'✓':guided.step+1} / 4</strong>
   </div>
   <div className="dist-guided-steps" role="list" aria-label={language==='es'?'Etapas de carga':'Etapas da carga'}>
    {labels.map((s,i)=><div key={s} role="listitem" className={i<guided.step?'done':i===guided.step?'active':''} aria-current={i===guided.step?'step':undefined}><span>{i<guided.step?'✓':i+1}</span>{s}</div>)}
   </div>
   <div className="dist-guided-summary"><strong>{language==='es'?'Resumen':'Resumo da carga'}</strong><span>{detail.lines.reduce((n,l)=>n+l.quantity,0)} UN · {new Set(detail.lines.map(l=>l.customerId)).size} {language==='es'?'clientes':'clientes'}</span></div>
   <div className="dist-table-wrap dist-load-lines"><table><thead><tr><th>{t('product')}</th><th>{t('customer')}</th><th>{t('quantity')}</th><th>{t('amount')}</th>{detail.state==='LOADING'&&<th>{t('checked')}</th>}</tr></thead><tbody>{detail.lines.map((l,i)=><tr key={l.id}><td data-label={t('product')}><strong>{l.description}</strong><small>{l.sku} · {l.orderId}</small></td><td data-label={t('customer')}>{l.customerName}<small>{l.destination}</small></td><td data-label={t('quantity')}>{l.quantity} {l.unit}</td><td data-label={t('amount')}>{distributionMoney(l.amount)}</td>{detail.state==='LOADING'&&<td data-label={t('checked')}><input aria-label={`${t('checked')} ${i+1}`} type="number" min="0" max={l.quantity} step="1" value={checked[i]??''} onChange={e=>{setPhysicalChecked(false);setChecked(s=>({...s,[i]:e.target.value}));}}/></td>}</tr>)}</tbody></table></div>
   <div className="dist-guided-actions">
    {guided.canPrepare&&<div className="dist-guided-panel">
     <p>{language==='es'?'Reserva las cantidades y abre la separación.':'Reserva as quantidades e inicia a separação em uma só ação.'}</p>
     <button className="primary" disabled={busy} onClick={()=>guidedCommands(detail.state==='DRAFT'?[{type:'RESERVE'},{type:'START_PICK'}]:[{type:'START_PICK'}])}>{words.start}</button>
    </div>}
    {guided.canCheck&&<div className="dist-guided-panel">
     <h3>{language==='es'?'Cantidades contadas':'Quantidades conferidas'}</h3>
     <button type="button" disabled={busy} onClick={()=>{setChecked(Object.fromEntries(detail.lines.map((l,i)=>[i,String(l.quantity)])));setPhysicalChecked(false);}}>{words.checkAll}</button>
     {!checkResult.full&&<label>{t('shortageReason')}<input maxLength="300" value={checkReason} onChange={e=>setCheckReason(e.target.value)}/></label>}
     {checkResult.valid&&!checkResult.full&&<p className="dist-guided-warning">{words.part}</p>}
     <label className="dist-guided-attest"><input type="checkbox" checked={physicalChecked} onChange={e=>setPhysicalChecked(e.target.checked)}/><span>{words.checkAttest}</span></label>
     <button className="primary" disabled={busy||!physicalChecked||!checkResult.valid} onClick={()=>guidedCommands(checkResult.full?[{type:'CHECK',payload:{quantities:checkResult.quantities,reason:''}},{type:'APPROVE'}]:[{type:'CHECK',payload:{quantities:checkResult.quantities,reason:checkResult.reason}}])}>{checkResult.full?words.finalizeCheck:words.check}</button>
    </div>}
    {guided.needsPartialApproval&&<div className="dist-guided-panel"><p className="dist-guided-warning">{words.part}</p>
     <button className="primary" disabled={busy||!detail.loadingCheck?.lines.some(l=>l.checked>0)} onClick={()=>guidedCommands([{type:'APPROVE',payload:{partial:true}}])}>{t('approvePartial')}</button>
    </div>}
    {guided.canApprove&&<div className="dist-guided-panel"><p>{language==='es'?'Conferencia registrada: falta aprobación.':'Conferência registrada: falta aprovação.'}</p>
     <button className="primary" disabled={busy} onClick={()=>guidedCommands([{type:'APPROVE'}])}>{t('approve')}</button>
    </div>}
    {guided.canConfirmTruck&&<div className="dist-guided-panel">
     <h3>{words.truck}</h3><p>{language==='es'?'Confirme la carga física del vehículo.':'Confirme fisicamente o carregamento do veículo.'}</p>
     <button type="button" disabled={busy} onClick={()=>{setTruck(Object.fromEntries(detail.lines.map(l=>[l.id,String(l.quantity)])));setPhysicalLoaded(false);}}>{words.truckAll}</button>
     <div className="dist-guided-quantities">{detail.lines.map(l=><label key={l.id}>{l.description} · {l.customerName} · {l.quantity} {l.unit}<input aria-label={`${t('truckLoading')} ${l.orderId} ${l.orderLineId}`} type="number" min="0" max={l.quantity} step="1" value={truck[l.id]??''} onChange={e=>{setPhysicalLoaded(false);setTruck(s=>({...s,[l.id]:e.target.value}));}}/></label>)}</div>
     <label className="dist-guided-attest"><input type="checkbox" checked={physicalLoaded} onChange={e=>setPhysicalLoaded(e.target.checked)}/><span>{words.truckAttest}</span></label>
     <button className="primary" disabled={busy||!physicalLoaded||!guidedTruckReady(detail.lines,truck)} onClick={()=>guidedCommands([{type:'CONFIRM_LOADING',payload:{quantities:detail.lines.map(l=>Number(truck[l.id]))}}])}>{words.truckConfirm}</button>
    </div>}
    {detail.state==='APPROVED'&&<div className="dist-guided-panel">
     <h3>{language==='es'?'Vehículo, conductor y ruta':'Veículo, motorista e rota'}</h3>
     <div className="dist-fields">{[['vehicle',vehicle,setVehicle],['driver',driver,setDriver],['route',route,setRoute]].map(([key,value,set])=><label key={key}>{t(key)}<input maxLength="100" value={value} onChange={e=>set(e.target.value)}/></label>)}</div>
     {guided.requiresManifest&&<button className="primary" disabled={busy||![vehicle,driver,route].every(s=>s.trim())} onClick={()=>guidedCommands([{type:'MANIFEST',payload:{vehicle,driver,route}}])}>{words.manifest}</button>}
     {guided.canDispatch&&<div className="dist-guided-final">
      <p>{language==='es'?'Documento actualizado. Compruébelo antes de confirmar la salida.':'Romaneio atualizado. Confira o documento antes da saída.'}</p>
      <button type="button" disabled={busy} onClick={()=>showVersion(detail.manifestVersions.at(-1).version)}>{language==='es'?'Visualizar romaneo':'Visualizar romaneio'}</button>
      <button className="primary" disabled={busy} onClick={()=>setConfirm('DISPATCH')}>{words.dispatch}</button>
     </div>}
    </div>}
    {detail.state==='DISPATCHED'&&<p className="dist-success" role="status">{words.complete}</p>}
   </div>
   <details className="dist-guided-extra"><summary>{words.advanced}</summary>
    {detail.state==='APPROVED'&&detail.truckLoading&&detail.manifestVersions.length>0&&<button type="button" disabled={busy||![vehicle,driver,route].every(s=>s.trim())} onClick={()=>guidedCommands([{type:'MANIFEST',payload:{vehicle,driver,route}}])}>{language==='es'?'Reemitir romaneo con nueva versión':'Reemitir romaneio com nova versão'}</button>}
    {['DRAFT','PLANNED','LOADING'].includes(detail.state)&&<button className="danger" disabled={busy} onClick={()=>setConfirm('CANCEL')}>{t('cancel')}</button>}
    {detail.loadingCheck&&<div className="dist-history"><h3>{t('checked')} · {detail.loadingCheck.operatorId}</h3><p>{detail.loadingCheck.reason}</p>{detail.loadingCheck.lines.map(row=><p key={row.lineId}>{(detail.lines.find(l=>l.id===row.lineId)||detail.partialApproval?.lines.find(l=>l.lineId===row.lineId))?.description} · {row.checked} / {row.authorized} · {t('shortage')}: {row.authorized-row.checked}</p>)}</div>}
    {detail.truckLoading&&<p>{t('truckLoading')} · {detail.truckLoading.operatorId} · {date(detail.truckLoading.at)}</p>}
    {!!detail.manifestVersions.length&&<div className="dist-history"><h3>{t('versions')}</h3>{detail.manifestVersions.map(m=><button disabled={busy} key={m.version} onClick={()=>showVersion(m.version)}>{t('version')} {m.version} · {date(m.issuedAt)} · {t('preview')}</button>)}</div>}
   </details>
   {confirm&&<div className="dist-confirm"><h3>{t(confirm==='CANCEL'?'confirmCancel':'confirmDispatch')}</h3><p>{t(confirm==='CANCEL'?'cancelHelp':'dispatchHelp')}</p><button className="primary" disabled={busy} onClick={()=>operate(confirm)}>{t('confirm')}</button><button disabled={busy} onClick={()=>setConfirm(null)}>{t('close')}</button></div>}
   {document&&<><div className="dist-actionbar"><label>{t('customer')} <select value={customerDocument} onChange={e=>setCustomerDocument(e.target.value)}><option value="">{t('loadSummary')}</option>{summarizeManifest(document).customers.map(group=><option key={group.key} value={group.key}>{group.name} · {group.city||t('cityUnknown')}</option>)}</select></label><button disabled={busy} onClick={download}>{t('pdf')}</button><button disabled={busy} onClick={async()=>{try{const {printManifest}=await import('../core/distribution/print.js');await printManifest(window.document.querySelector('[data-testid=manifest-preview]'),distributionPrintCss);}catch(e){fail(e);}}}>{t('print')}</button></div><ManifestView document={customerDocument?manifestForCustomer(document,customerDocument):document} t={t} copy={copy}/></>}
   {busy&&<p role="status">{t('loading')}</p>}
  </div></div>}
 </section>;
}
export function ManifestView({document:d,t,copy}) {
 const {products,customers}=summarizeManifest(d);
 return <article className="dist-manifest" data-testid="manifest-preview"><header><div><p>{d.issuer.name}</p><small>{d.issuer.taxId}</small><h2>{t('manifestTitle').toLocaleUpperCase()}</h2><strong>{d.number} · {t('version')} {d.version} {copy&&`· ${t('copy')}`}</strong></div>{d.issuer.logoData&&<img src={d.issuer.logoData} alt={d.issuer.name}/>}</header><p>{t('date')}: {new Date(d.issuedAt).toLocaleString(t('today')==='Hoy'?'es-PY':'pt-BR',{timeZone:d.timeZone||'UTC'})}</p><p>{t('warehouse')}: {d.warehouseId} · {t('vehicle')}: {d.vehicle}</p><p>{t('driver')}: {d.driver} · {t('route')}: {d.route}</p><h3>{t('loadSummary')}</h3><table><thead><tr><th>{t('product')}</th><th>{t('authorizedQuantity')}</th></tr></thead><tbody>{products.map(row=><tr key={row.key}><td>{row.sku} · {row.description}<small>{[row.variant,row.packaging,row.lot,row.warehouseId].filter(Boolean).join(' · ')}</small></td><td>{row.quantity} {row.unit}</td></tr>)}</tbody></table><h3>{t('byCustomer')}</h3>{customers.map(group=><section key={group.key}><h4>{group.city||t('cityUnknown')} · {group.name}</h4><table><thead><tr><th>{t('customer')}</th><th>{t('product')}</th><th>{t('quantity')}</th><th>{t('amount')}</th></tr></thead><tbody>{group.lines.map(l=><tr key={l.id}><td>{l.customerName}<small>{l.destination}<br/>{l.orderId}</small></td><td>{l.sku}<small>{l.description}</small></td><td>{l.quantity} {l.unit}</td><td>{distributionMoney(l.amount)}</td></tr>)}</tbody></table></section>)}<h3>{t('total')}</h3>{Object.entries(d.totalsByCurrency).map(([currency,minor])=><p key={currency}>{distributionMoney({currency,minor,precision:currency==='PYG'?0:2})}</p>)}<div className="dist-signatures"><span>{t('signCheck')}</span><span>{t('signDriver')}</span></div><footer>{t('verification')}: {d.verificationCode}<br/>{t('nonFiscal')}</footer></article>;
}

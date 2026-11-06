import {spawn} from 'node:child_process';import {mkdir,writeFile} from 'node:fs/promises';
import {requireEmulators} from '../../operational-functions/src/distribution/security.js';
requireEmulators();const children=[];
function start(args){const p=spawn(process.execPath,args,{stdio:'inherit',env:process.env});children.push(p);return p;}
async function run(args){await new Promise((resolve,reject)=>{const p=start(args);p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error(`Exit ${c}: ${args.join(' ')}`)));});}
async function wait(url){for(let i=0;i<150;i++){try{await fetch(url);return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('HOMOLOGATION_SERVICE_UNAVAILABLE');}
try{
 start(['operational-functions/src/distribution/server.js']);await wait('http://127.0.0.1:8787/query');
 if(!process.argv.includes('--browser-only'))await run(['--test','operational-functions/test/distribution/trips.test.mjs']);
 if(process.argv.includes('--browser')||process.argv.includes('--browser-only')){
  const {setupTrip,route,dispatched,db}=await import('../../operational-functions/test/distribution/trip-fixture.mjs');const f=await setupTrip({uid:'distribution-trip-browser'});
  await route(f,'manager','SAVE_VEHICLE','V1',0,{plate:'HML-2026',name:'Furgão de homologação'});await route(f,'manager','SAVE_ROUTE','R1',0,{name:'Centro / Vila Operária',notes:'Roteiro sintético'});for(const id of ['O001','O002','O003'])await dispatched(f,'L-'+id,id);
  start(['node_modules/vite/bin/vite.js','--mode','homologacao','--host','127.0.0.1','--strictPort']);await wait('http://127.0.0.1:5173/');await mkdir('tmp/distribution3',{recursive:true});await run(['scripts/distribution/phase3-browser.mjs']);
  const trips=await db.collection(`${f.root}/distribution_trips`).get(),t=trips.docs[0].data(),stock=(await db.doc(`${f.base}/produtos/P1`).get()).data().data,customer=(await db.doc(`${f.base}/clientes/C1`).get()).data().data,ledger=await db.collection(`${f.root}/financeiro_livro`).get(),sales=await db.collection(`${f.base}/vendas`).get();
  const sold=sales.docs.map(d=>d.data().data),net=ledger.docs.reduce((a,d)=>{const e=d.data();return a+(e.afetaResultado?(e.direcao==='saida'?-e.valor:e.valor):0);},0);
  if(t.state!=='CLOSED'||stock.estoque!==92||customer.saldoDevedorBRL!==0||ledger.size!==7||net!==210||sold.some(s=>s.tipoDocumento!=='venda'))throw Error('PHASE3_BROWSER_INTEGRITY_FAILED');
  await writeFile('tmp/distribution3/integrity.json',JSON.stringify({passed:true,tripId:t.id,state:t.state,initialStock:100,dispatched:15,reintegrated:7,quarantined:1,availableStock:stock.estoque,reserved:stock.estoqueReservadoDistribuicao,customerDebtBRL:customer.saldoDevedorBRL,ledgerEntries:ledger.size,netResultBRL:net,nativeCustody:t.settlement.expected,nativeDivergence:t.settlement.differences,sales:sold.map(s=>({id:s.id,state:s.estado,originalCurrency:s.moedaDocumento,originalTotal:s.totalOriginal,refundBRL:s.valorDevolvidoBRL||0,sellerId:s.vendedorId})),outboxLocalOnly:(await db.collection(`${f.root}/distribution_outbox`).get()).docs.every(d=>d.data().state==='LOCAL_ONLY')},null,2));
 }
}finally{for(const p of children)if(p.exitCode===null)p.kill('SIGTERM');}

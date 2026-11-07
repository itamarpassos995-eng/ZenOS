import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {seed,db} from '../../operational-functions/test/distribution/fixture.mjs';
import {requireEmulators} from '../../operational-functions/src/distribution/security.js';
requireEmulators();
const children=[];
const start=args=>{const p=spawn(process.execPath,args,{stdio:'inherit',env:process.env});children.push(p);return p;};
async function wait(url){for(let i=0;i<180;i++){try{await fetch(url);return;}catch{}await new Promise(r=>setTimeout(r,150));}throw Error('SERVICE_UNAVAILABLE');}
async function run(args){await new Promise((resolve,reject)=>{
 const p=start(args);p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error(`Exit ${c}: ${args.join(' ')}`)));
});}
try{
 const f=await seed('distribution-occ-browser',{stock:100,orders:2});
 await db.doc(`${f.root}/distribution_config/module`).update({fiscalCountry:'PY'});
 await db.doc(`${f.base}/vendas/O001`).update({'data.fiscalOriginal':{
  id:'INV-SYNTHETIC',country:'PY',reference:'CDC-SYNTHETIC-ONLY',status:'autorizado'
 }});
 await mkdir('tmp/distribution31a2',{recursive:true});
 start(['operational-functions/src/distribution/server.js']);
 await wait('http://127.0.0.1:8787/query');
 start(['node_modules/vite/bin/vite.js','--mode','homologacao','--host','127.0.0.1','--strictPort']);
 await wait('http://127.0.0.1:5173/distribution-homologacao.html');
 await run(['scripts/distribution/phase31-a2-browser.mjs']);
 const stock=(await db.doc(`${f.base}/produtos/P1`).get()).data().data;
 const ledger=await db.collection(`${f.root}/financeiro_livro`).get();
 const occurrences=await db.collection(`${f.root}/distribution_occurrences`).get();
 if(stock.estoque!==100||ledger.size!==0||occurrences.size!==1)throw Error('OCCURRENCE_INTEGRITY_FAILED');
 const o=occurrences.docs[0].data();
 if(o.fiscalDocuments.length!==1||o.fiscalDocuments[0].authorized!==false||
   o.fiscalDocuments[0].eligibilityVerified!==false||
   o.states.financial!=='NOT_REQUESTED')throw Error('FISCAL_DRAFT_EFFECT_CONFLICT');
 const adjustments=await db.collection(`${f.root}/distribution_adjustments`).get();
 const representations=await db.collection(`${f.root}/distribution_adjustment_representations`).get();
 const lineReservations=await db.collection(`${f.root}/distribution_adjustment_sale_lines`).get();
 if(adjustments.size!==1||representations.size!==1||lineReservations.size!==1||
   adjustments.docs[0].data().fiscalDocument.authorized!==false||
   adjustments.docs[0].data().financialPreview.state!=='RECONCILIATION_REQUIRED'||
   adjustments.docs[0].data().value.currency!=='PYG'||
   adjustments.docs[0].data().value.minor!=='79980')
  throw Error('COMMERCIAL_ADJUSTMENT_INTEGRITY_FAILED');
 const evidence=await db.collection(`${f.root}/distribution_evidence`).get();
 if(evidence.size!==1||o.evidence?.length!==1||o.evidence[0].base64!==undefined||
   !o.evidence[0].sha256||o.evidence[0].status!=='INVALIDATED'||evidence.docs[0].data().status!=='INVALIDATED')throw Error('PRIVATE_EVIDENCE_INTEGRITY_FAILED');
 await writeFile('tmp/distribution31a2/database-integrity.json',JSON.stringify({
  passed:true,stock:stock.estoque,ledgerEntries:ledger.size,occurrences:occurrences.size,
  financialState:o.states.financial,fiscalState:o.states.fiscal,authorized:o.fiscalDocuments[0].authorized,privateEvidence:evidence.size,commercialDrafts:adjustments.size,commercialMinor:adjustments.docs[0].data().value.minor
 },null,2));
 console.log('PHASE31_A2_BROWSER_AND_DATABASE_SUCCESS');
}finally{
 for(const p of children){if(!p.killed)try{p.kill('SIGTERM');}catch{}}
}

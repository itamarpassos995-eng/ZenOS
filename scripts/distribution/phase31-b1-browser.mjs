import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {db,PASSWORD,PIN} from '../../operational-functions/test/distribution/fixture.mjs';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'pt-BR'});
const page=await context.newPage();
try{
 await mkdir('tmp/distribution31a2',{recursive:true});
 await page.goto('http://127.0.0.1:5173/distribution-homologacao.html');
 await page.getByLabel('E-mail da empresa',{exact:true}).fill('distribution-occ-browser@example.test');
 await page.getByLabel('Senha da empresa',{exact:true}).fill(PASSWORD);
 await page.getByRole('button',{name:'Acessar distribuição',exact:true}).click();
 await page.getByLabel('PIN do operador',{exact:true}).fill(PIN);
 await page.getByRole('button',{name:'Acessar distribuição',exact:true}).click();
 await page.getByRole('button',{name:'Ocorrências e devoluções',exact:true}).click();
 await page.locator('.dist-occ-item').first().click();
 await page.locator('.dist-commercial-row').first().click();
 await page.getByTestId('distribution-reconciliation').waitFor();
 await page.getByRole('button',{name:'Conferir registros de origem',exact:true}).click();
 await page.getByText('Divergência',{exact:true}).waitFor();
 await page.getByText('A compensação financeira permanece bloqueada nesta etapa.',{exact:true}).waitFor();
 await page.screenshot({path:'tmp/distribution31a2/reconciliation-desktop-pt.png',fullPage:true});
 const ref=db.doc('lojas/distribution-occ-browser');
 const control=(await db.doc(ref.path+'/dados/storage_control').get()).data();
 const base=ref.path+'/v2_generations/'+control.generation;
 await db.doc(base+'/vendas/O001').update({'data.estado':'concluida'});
 await page.getByRole('button',{name:'Verificar alterações',exact:true}).click();
 await page.getByText('A origem foi modificada. A conciliação anterior está obsoleta.',{exact:true}).waitFor();
 await page.screenshot({path:'tmp/distribution31a2/reconciliation-stale-desktop-pt.png',fullPage:true});
 const docs=await db.collection(ref.path+'/distribution_reconciliations').get();
 assert.equal(docs.size,1);
 assert.equal(docs.docs[0].data().financialExecution,'BLOCKED_B1');
 assert.equal((await db.collection(ref.path+'/financeiro_livro').get()).size,0);
 await writeFile('tmp/distribution31a2/reconciliation-browser-integrity.json',
  JSON.stringify({passed:true,status:docs.docs[0].data().state,
   financialExecution:docs.docs[0].data().financialExecution,
   staleDetection:true,financialLedgerEntries:0},null,2));
 // B.2: a distinct synthetic, explicitly linked credit sale; old B.1 snapshot is retained.
 await db.doc(base+'/vendas/O001').update({'data.tipoDocumento':'venda',
  'data.estado':'concluida','data.pagamentos':[{
   id:'CREDIT1',formaId:'crediario',moedaOrigem:'PYG',valorOriginal:199950
  }]});
 const orig={lojaId:'distribution-occ-browser',referenciaId:'O001',clienteId:'C1',
  financeLinkVersion:2,receivableId:'REC1',installmentId:'INST1',moeda:'PYG'};
 const write=db.batch();
 write.set(db.doc(ref.path+'/financeiro_livro/DEBT1'),{
  ...orig,id:'DEBT1',financeEventType:'OBLIGATION',valor:199950,createdAt:'2026-11-01T00:00:00Z'
 });
 for(const [id,value,day] of [['PAY1',40000,2],['PAY2',30000,3],['PAY3',20000,4]]){
  write.set(db.doc(ref.path+'/financeiro_livro/'+id),{
   ...orig,id,financeEventType:'RECEIPT',paymentId:id,sourceEventId:'DEBT1',
   valor:value,createdAt:'2026-11-0'+day+'T00:00:00Z',
   status:'liquidado',liquidacaoConfirmada:true,comprovanteId:'SYNTHETIC-'+id
  });
 }
 await write.commit();
 await page.getByRole('button',{name:'Conferir registros de origem',exact:true}).click();
 await page.getByText('Conciliado com evidências',{exact:true}).waitFor();
 await page.getByText('Parcelas vinculadas (1)').click();
 await page.getByText('INST1 · PARTIALLY_PAID').waitFor();
 const rows=await db.collection(ref.path+'/distribution_reconciliations').get();
 assert.equal(rows.size,1);
 assert.equal(rows.docs[0].data().verifiedReceived.minor,'90000');
 assert.equal(rows.docs[0].data().verifiedOpen.minor,'109950');
 assert.equal(rows.docs[0].data().eligibility.executable,false);
 await page.screenshot({path:'tmp/distribution31a2/reconciliation-b2-partial-credit-pt.png',fullPage:true});
 await writeFile('tmp/distribution31a2/b2-partial-credit-integrity.json',JSON.stringify({
  passed:true,received:'90000',open:'109950',installment:'INST1',
  financialExecution:rows.docs[0].data().financialExecution,executable:false
 },null,2));
 console.log('PHASE31_B2_BROWSER_SUCCESS');
 console.log('PHASE31_B1_BROWSER_SUCCESS');
}finally{await context.close();await browser.close();}

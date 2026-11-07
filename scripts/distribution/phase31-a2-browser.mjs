import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[],screens=[],contexts=[];
const open=async(mobile=false)=>{
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1050},
  timezoneId:'America/Asuncion',locale:'pt-BR'});
 contexts.push(context);const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',async r=>{if(r.url().includes('/__distribution/')&&r.status()>=400)errors.push(`HTTP ${r.status()} ${r.url()}`);});
 return page;
};
async function login(page){
 await page.goto('http://127.0.0.1:5173/distribution-homologacao.html');
 await page.getByLabel('E-mail da empresa',{exact:true}).fill('distribution-occ-browser@example.test');
 await page.getByLabel('Senha da empresa',{exact:true}).fill('SyntheticOnly!482759');
 await page.getByRole('button',{name:'Acessar distribuição',exact:true}).click();
 await page.getByLabel('PIN do operador',{exact:true}).fill('482759');
 await page.getByRole('button',{name:'Acessar distribuição',exact:true}).click();
 await page.getByRole('button',{name:'Ocorrências e devoluções',exact:true}).waitFor();
 await page.getByRole('button',{name:'Ocorrências e devoluções',exact:true}).click();
 await page.getByTestId('distribution-occurrences').waitFor();
}
try{
 await mkdir('tmp/distribution31a2',{recursive:true});
 const desktop=await open(false);
 await login(desktop);
 assert.equal(await desktop.getByRole('heading',{name:'Ocorrências e Devoluções'}).count(),1);
 await desktop.getByRole('button',{name:'Registrar ocorrência',exact:true}).click();
 await desktop.screenshot({path:'tmp/distribution31a2/before-create-desktop.png',fullPage:true});
 console.log('DEBUG_FORM',JSON.stringify({shade:await desktop.locator('.dist-occ-shade').count(),
  labels:await desktop.locator('label').allTextContents(),
  excerpt:(await desktop.locator('body').innerText()).slice(-1100)}));
 await desktop.locator('.dist-occ-shade select').first().selectOption('O001');
 await desktop.getByLabel('Quantidade',{exact:true}).fill('2');
 await desktop.getByLabel('Descrição da ocorrência',{exact:true}).fill('Duas unidades faltaram na entrega sintética');
 await desktop.getByRole('button',{name:'Salvar ocorrência',exact:true}).click();
 await desktop.getByRole('button',{name:'Iniciar conferência',exact:true}).waitFor();
 await desktop.getByRole('button',{name:'Iniciar conferência',exact:true}).click();
 await desktop.getByRole('button',{name:'Confirmar ocorrência',exact:true}).waitFor();
 await desktop.getByRole('button',{name:'Confirmar ocorrência',exact:true}).click();
 await desktop.getByRole('button',{name:'Solicitar rascunho fiscal',exact:true}).waitFor();
 await desktop.getByRole('button',{name:'Solicitar rascunho fiscal',exact:true}).click();
 await desktop.getByRole('button',{name:'Preparar rascunho interno',exact:true}).waitFor();
 await desktop.getByRole('button',{name:'Preparar rascunho interno',exact:true}).click();
 await desktop.getByText('Nenhum documento foi transmitido ou autorizado.').waitFor();
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/LysAAAAASUVORK5CYII=','base64');
 await desktop.locator('.dist-occ-evidence-controls input[type=file]').setInputFiles({
  name:'foto-sintetica.png',mimeType:'image/png',buffer:image
 });
 await desktop.getByRole('button',{name:'Anexar evidência',exact:true}).click();
 await desktop.getByRole('button',{name:'Baixar evidência',exact:true}).waitFor();
 const download=desktop.waitForEvent('download');
 await desktop.getByRole('button',{name:'Baixar evidência',exact:true}).click();
 const saved=await download;await saved.saveAs('tmp/distribution31a2/private-evidence-downloaded.png');
 await desktop.getByRole('button',{name:'Invalidar evidência',exact:true}).first().click();
 await desktop.getByLabel('Motivo da invalidação',{exact:true}).fill('Foto sintética substituída após conferência autorizada');
 await desktop.locator('.dist-occ-evidence .dist-confirm').getByRole('button',{name:'Invalidar evidência',exact:true}).click();
 await desktop.getByText(/Invalidada/).waitFor();
 assert.equal(await desktop.getByRole('button',{name:'Baixar evidência',exact:true}).count(),0);
 await desktop.screenshot({path:'tmp/distribution31a2/occurrences-desktop-pt.png',fullPage:true});
 screens.push('occurrences-desktop-pt.png');
 const state=await desktop.locator('.dist-occ-status').innerText();
 assert.match(state,/Confirmada/);assert.match(state,/Revisão pendente/);assert.match(state,/Não solicitado/);
 await desktop.getByRole('dialog').getByRole('button',{name:'Fechar',exact:true}).click();
 const mobile=await open(true);
 await login(mobile);
 await mobile.getByRole('combobox',{name:'Idioma'}).selectOption('es');
 await mobile.getByRole('heading',{name:'Incidencias y Devoluciones'}).waitFor();
 await mobile.locator('.dist-occ-item').first().click();
 await mobile.getByText('Ningún documento fue transmitido ni autorizado.').waitFor();
 await mobile.screenshot({path:'tmp/distribution31a2/occurrences-mobile-es.png',fullPage:true});
 screens.push('occurrences-mobile-es.png');
 assert.deepEqual(errors,[]);
 await writeFile('tmp/distribution31a2/browser-integrity.json',JSON.stringify({
  passed:true,desktop:{width:1440,height:1050},mobile:{width:390,height:844},
  screenshots:screens,checks:['login','occurrence create','server review','fiscal draft pending','private evidence upload/download/invalidation','PT/ES','mobile layout','no http errors'],errors
 },null,2));
 console.log('PHASE31_A2_BROWSER_SUCCESS',JSON.stringify(screens));
}finally{
 await Promise.all(contexts.map(c=>c.close()));
 await browser.close();
}

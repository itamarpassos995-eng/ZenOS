import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { montarBackup, validarBackup, simularRestauracaoEmMemoria, stringifyCanonico } from '../src/core/backupCore.js';
import { criarCredencialPin, verificarPinOperador, pinEhFraco, operadorRequerTrocaPin } from '../src/core/operatorPin.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
let ok=0;
const check=async(name,fn)=>{await fn();ok++;console.log(`[OK] ${name}`);};

const produtos970=Array.from({length:970},(_,i)=>({id:`P-${i+1}`,sku:`SKU-${i+1}`,nome:`Produto ${i+1}`,estoque:i%50,estoqueVitrine:i%5,estoqueGalpao:(i%50)-(i%5),precoBRL:20+i,custoBRL:10+i,localizacao:`A-${i%20}`}));
const clientes500=Array.from({length:500},(_,i)=>({id:`C-${i+1}`,nome:`Cliente ${i+1}`,saldoDevedorBRL:i%9===0?100:0}));
const vendas5000=Array.from({length:5000},(_,i)=>({id:`V-${i+1}`,createdAt:`2026-10-${String((i%28)+1).padStart(2,'0')}T10:00:00.000Z`,totalBRL:100+(i%17),estado:'concluida',itens:[{produtoOriginalId:`P-${(i%970)+1}`,qtd:1}]}));
const baseDados={operacao:{produtos:produtos970,clientes:clientes500,fornecedores:[],historicoVendas:vendas5000,historicoCompras:[],despesas:[],caixaMovimentos:[],sessoesCaixa:[],vouchers:[],vendedores:[]},configuracoes:{perfilLoja:{nomeFantasia:'Loja Teste'}},mesas:{mesas:[]},financeiroLivro:[],produtoIndices:produtos970.map(p=>({id:`sku-${p.sku}`,produtoId:p.id})),estoqueAuditoria:[]};

await check('Backup de 970 produtos preserva contagens e checksum', async()=>{
  const b=await montarBackup({lojaId:'loja-teste',createdBy:'Admin',dados:baseDados});
  const v=await validarBackup(b); assert.equal(v.ok,true); assert.equal(v.counts.produtos,970); assert.equal(v.counts.clientes,500); assert.equal(v.counts.vendas,5000);
});
await check('Restauração simulada preserva conteúdo byte lógico do backup', async()=>{
  const b=await montarBackup({lojaId:'loja-teste',createdBy:'Admin',dados:baseDados});
  const restaurado=simularRestauracaoEmMemoria(b); assert.equal(stringifyCanonico(restaurado),stringifyCanonico(b.data));
  assert.deepEqual(restaurado.operacao.produtos.map(p=>p.id),produtos970.map(p=>p.id));
});
await check('Backup adulterado é rejeitado por checksum', async()=>{
  const b=await montarBackup({lojaId:'loja-teste',createdBy:'Admin',dados:baseDados}); b.data.operacao.produtos[0].nome='ALTERADO'; const v=await validarBackup(b); assert.equal(v.ok,false); assert.ok(v.erros.some(e=>e.includes('Checksum')));
});
await check('Stress artificial mantém 1000 produtos, 500 clientes e 5000 vendas', async()=>{
  const dados=structuredClone(baseDados); dados.operacao.produtos=Array.from({length:1000},(_,i)=>({...produtos970[i%970],id:`ST-${i}`,sku:`STSKU-${i}`}));
  const b=await montarBackup({lojaId:'stress',createdBy:'Teste',dados}); const v=await validarBackup(b); assert.equal(v.counts.produtos,1000); assert.equal(v.counts.clientes,500); assert.equal(v.counts.vendas,5000);
});

await check('Backup real é somente leitura e restauração é bloqueada fora da homologação',()=>{
  const src=read('src/core/backupRecovery.js'); assert.match(src,/Restauração de backup é bloqueada fora da homologação/); assert.match(src,/destinoHomologacaoEstaVazio/); assert.doesNotMatch(src,/deleteDoc|deleteField/);
});
await check('Configurações exige backup validado antes da zona destrutiva',()=>{
  const src=read('src/components/Configuracoes.jsx'); assert.match(src,/Exportar Backup Validado/); assert.match(src,/Backup obrigatório/); assert.match(src,/restaurarBackupSomenteHomologacao/);
});

await check('Storage operacional é centralizado e não usa localStorage.clear',()=>{
  const files=[]; const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.(js|jsx)$/.test(e.name))files.push(p);}}; walk(path.join(root,'src'));
  for(const f of files){const src=fs.readFileSync(f,'utf8'); if(!f.endsWith(path.join('core','storage.js'))) assert.doesNotMatch(src,/\blocalStorage\.(getItem|setItem|removeItem|clear)\s*\(/,f); assert.doesNotMatch(src,/localStorage\.clear\s*\(/,f);}
});
await check('Chaves de negócio do App continuam namespaceadas pelo UID',()=>{const app=read('src/App.jsx'); for(const k of ['produtos','clientes','historico_vendas','caixa_movs','despesas','historico_compras','fornecedores','vouchers','sessoes_caixa','vendedores']) assert.match(app,new RegExp(`zenos_\\$\\{userId\\}_${k}`));});
await check('Mesas migram cache legado somente da chave específica do UID e deixam de gravar localmente',()=>{const src=read('src/components/Mesas.jsx'); assert.match(src,/zenos_\$\{userId\}_mesas_ativas/); assert.doesNotMatch(src,/zenosStorage\.setItem/); assert.match(src,/assinarMesasV1/);});

await check('Indicador global possui todos os estados obrigatórios',()=>{const app=read('src/App.jsx'); for(const st of ['SALVANDO','SINCRONIZADO','PENDENTE','OFFLINE','ERRO']) assert.match(app,new RegExp(st)); assert.match(app,/Erro ao sincronizar/);});
await check('Indicador global agrega estado por domínio e não deixa sucesso posterior esconder falha pendente',()=>{const app=read('src/App.jsx'); assert.match(app,/syncCamposRef = useRef\(new Map\(\)\)/); assert.match(app,/estados\.some\(x => x\.status === 'ERRO'\)/); assert.match(app,/estados\.some\(x => x\.status === 'PENDENTE'\)/); assert.match(app,/estados\.every\(x => x\.status === 'SINCRONIZADO'\)/);});
await check('Persistência só declara sincronizado após setDoc confirmado e grava timestamp de servidor',()=>{const src=read('src/core/persistenceSafety.js'); const posAwait=src.indexOf('await setDoc'); const posSync=src.indexOf("status = localResult.ok ? 'SINCRONIZADO'"); assert.ok(posAwait>=0&&posSync>posAwait); assert.match(src,/serverTimestamp\(\)/);});
await check('Harness Emulator usa imports ESM explícitos na cadeia Mesas → persistência → storage',()=>{const persistence=read('src/core/persistenceSafety.js'); const storage=read('src/core/storage.js'); assert.match(persistence,/from ['\"]\.\/storage\.js['\"]/); assert.match(storage,/from ['\"]\.\/runtimeEnvironment\.js['\"]/);});
await check('Falha de bootstrap continua bloqueando gravações e não trata nuvem falha como vazia',()=>{const app=read('src/App.jsx'); assert.match(app,/PROTEÇÃO DE DADOS ATIVA/); const ini=app.indexOf("console.error('[ZenOS][BOOTSTRAP]"); const fim=app.indexOf('// ATT 06.2:',ini); assert.ok(ini>=0); assert.doesNotMatch(app.slice(ini,fim),/setNuvemSincronizada\(true\)/);});

await check('PINs previsíveis são bloqueados',()=>{for(const p of ['admin','1234','0000','1111','password','senha']) assert.equal(pinEhFraco(p),true); assert.equal(pinEhFraco('87Z!42'),false);});
await check('Novo PIN é salvo como hash+salt, sem texto puro, e autentica corretamente',async()=>{const c=await criarCredencialPin('87Z!42'); assert.ok(c.pinHash&&c.pinSalt); assert.equal(c.senha,null); const op={id:'x',...c}; assert.equal(await verificarPinOperador(op,'87Z!42'),true); assert.equal(await verificarPinOperador(op,'errado'),false);});
await check('Credencial legada em texto puro exige troca no próximo acesso',()=>{assert.equal(operadorRequerTrocaPin({id:'admin',senha:'admin'}),true); assert.equal(operadorRequerTrocaPin({id:'v',senha:'forte987'}),true);});
await check('App força troca do PIN temporário e não mantém 1234 como senha gerencial padrão',()=>{const app=read('src/App.jsx'); assert.match(app,/SEGURANÇA OBRIGATÓRIA/); assert.match(app,/pinTrocaObrigatoria: true/); assert.match(app,/senhaGerente: ''/);});
await check('Troca obrigatória de PIN só finaliza após confirmação de persistência na nuvem',()=>{const app=read('src/App.jsx'); const ini=app.indexOf('const concluirTrocaPinObrigatoria'); const fim=app.indexOf('const solicitarDemoFirebase',ini); const trecho=app.slice(ini,fim); assert.match(trecho,/await persistV1OperationField/); assert.match(trecho,/if \(!persistencia\?\.cloudOk\) throw/);});

await check('Novas persistências críticas possuem timestamp confiável de servidor quando aplicável',()=>{
  for(const rel of ['src/core/persistenceSafety.js','src/core/financialLedger.js','src/core/stockAudit.js','src/core/productRegistry.js','src/core/tablesV1.js']) assert.match(read(rel),/serverTimestamp\(\)/,rel);
});
await check('Compatibilidade histórica de datas continua preservada',()=>{const d=read('src/core/dates.js'); assert.match(d,/parseLegacyDate|parseZenOSDate/);});

await check('Mesas não dependem mais exclusivamente do localStorage e usam transação Firestore para concorrência',()=>{const m=read('src/components/Mesas.jsx'); const core=read('src/core/tablesV1.js'); assert.match(m,/MÓDULO EXPERIMENTAL/); assert.match(core,/runTransaction/); assert.match(core,/version:Number\(atual\.version/);});
await check('Mesas permanecem explicitamente EXPERIMENTAIS até estoque/financeiro/misto serem validados',()=>{assert.match(read('src/components/Mesas.jsx'),/MÓDULO EXPERIMENTAL/);});

await check('Nenhum diálogo nativo existe em src',()=>{const files=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.(js|jsx)$/.test(e.name))files.push(p);}};walk(path.join(root,'src'));for(const f of files){const src=fs.readFileSync(f,'utf8');assert.doesNotMatch(src,/window\.(?:alert|confirm|prompt)\s*\(/,f);assert.doesNotMatch(src,/(?:^|[^\w.])(?:alert|confirm|prompt)\s*\(/m,f);}});
await check('ATT 09 não ativa V2, dual-write ou shadow mode',()=>{const all=fs.readdirSync(path.join(root,'src/core')).map(f=>read(`src/core/${f}`)).join('\n')+read('src/App.jsx'); assert.doesNotMatch(all,/useV2Database\s*=\s*true|schemaVersion\s*:\s*2|shadow mode|dual-write/i);});

console.log(`\nATT 09: ${ok}/${ok} verificações de blindagem final da V1 aprovadas.`);

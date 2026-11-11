#!/usr/bin/env node
/* Read-only pre-release gate. NEVER calls Firebase/Firestore or deploy.
   Scope: stage 1 production V1/V2 and access controls WITHOUT shipping Commerce. */
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {strict as assert} from 'node:assert';
const protectedPaths=[
 'src/App.jsx','src/components/PDV.jsx','src/core/productionSync.js',
 'src/core/operationalV2.js','src/core/operationalRepository.js',
 'src/core/pdvDraft.js','src/firebase.js','functions/src/index.js',
 'firebase.json','.firebaserc','functions/src/fiscalAdministracao.js',
 'functions/src/fiscalSolicitacaoCliente.js'
];
const cmd=(command,args)=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const base=process.env.COMMERCE_PROTECTED_BASE||'origin/main';
let changed=[];
try{changed=cmd('git',['diff','--name-only',base+'...HEAD','--']).split('\n').filter(Boolean);}
catch(e){console.error('GATE_FAIL: não foi possível comparar a branch com origin/main. Nenhuma publicação é autorizada.');process.exit(2);}
const prohibited=changed.filter(p=>protectedPaths.includes(p));
assert.deepEqual(prohibited,[],`GATE_FAIL: arquivos operacionais protegidos foram alterados: ${prohibited.join(', ')}`);
for(const file of ['functions/src/commerceProductionPolicyCore.js','functions/src/commerceOperationalRead.js','functions/test/commerceProductionPolicy.test.mjs','functions/test/commerceOperationalRead.test.mjs']){
 assert.ok(fs.existsSync(file),`GATE_FAIL: proteção ausente: ${file}`);
}
const idx=fs.readFileSync('functions/src/index.js','utf8');
assert.ok(!idx.includes('commerceLoja')&&!idx.includes('commercePedidosAdmin'), 'GATE_FAIL: funções Commerce não devem ser exportadas nesta fase.');
const safety=fs.readFileSync('functions/src/commerceProductionPolicyCore.js','utf8');
assert.ok(safety.includes('PRODUCTION_KILL_SWITCH_OFF')&&safety.includes('OWNER_ACTIVATION_REQUIRED'));
const pkg=JSON.parse(fs.readFileSync('functions/package.json','utf8'));
assert.ok(pkg.dependencies['firebase-functions']&&pkg.dependencies['firebase-admin']);
console.log('STAGE_1_OK: adaptador de leitura V1/V2 e política de autorização preparados, nenhuma função Commerce implantada.');
console.log('PRODUCTION_DEPLOY_BLOCKED: etapa 1 NÃO libera Hosting, Functions, Storage ou Firestore.');

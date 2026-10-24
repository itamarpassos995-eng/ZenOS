import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('src/App.jsx');
const repo=read('src/core/operationalRepository.js');
const writer=read('src/core/operationalV2.js');
const sync=read('src/core/productionSync.js');

// Evita reconsultar o mesmo candidato, mas mantém ambas as confirmações.
assert.match(app,/reconciliacaoFiadoTentadasRef = useRef\(new Set\(\)\)/);
assert.match(app,/\.filter\(c => c\.operationKey && !reconciliacaoFiadoTentadasRef\.current\.has/);
assert.match(app,/reconciliacaoFiadoTentadasRef\.current\.add\(chaveTentativa\)/);
assert.match(app,/getOperationalSnapshot\(db,userId\)/);
assert.match(app,/getDocsFromServer\(query\(collection\(db,'lojas',String\(userId\),'financeiro_livro'\)/);
assert.match(app,/guards:\[\{type:'entity_unchanged'/);

// Nenhum fast-path baseado somente no cache/listener, sem cabeçalho remoto.
assert.match(repo,/async catchUpIfBehind\(\)/);
assert.match(repo,/const head=await getDocFromServer\(doc\(this\.db,\.\.\.this\.root\)\)/);
assert.match(repo,/if\(remoteSequence===this\.sequence\)return/);
assert.match(repo,/await this\.catchUp\(\)/);
assert.match(repo,/this\.sequence<remoteSequence/);
assert.match(repo,/await entry\.session\.catchUpIfBehind\(\)/);
assert.match(repo,/getDocFromServer\(doc\(db,'lojas',String\(userId\),'dados','operacao'\)\)/);

// Não modificar motor transacional; diffs do PR precisam confirmar.
assert.match(writer,/await session\.catchUp\(\)/);
assert.match(sync,/persistV1BusinessOperationSafe/);
console.log('Firestore P0: uma tentativa por candidato e conferência remota V2 preservadas.');

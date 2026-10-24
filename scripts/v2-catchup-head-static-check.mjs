// Verificação estática complementar. Não substitui integração Firebase/medições.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../src/core/operationalRepository.js',import.meta.url),'utf8');
assert.match(code,/async catchUpIfBehind\(\)/);
assert.match(code,/getDocFromServer\(doc\(this\.db,\.\.\.this\.root\)\)/);
assert.match(code,/remoteSequence===this\.sequence/);
assert.match(code,/await this\.catchUp\(\)/);
assert.match(code,/this\.catchUpCheckPromise=pending/);
assert.match(code,/getOperationalSnapshot[\s\S]*?await entry\.session\.catchUpIfBehind\(\)/);
assert.match(code,/if\(receipt\.sequence!==this\.sequence\+1\)throw/);
assert.match(code,/getDocsFromServer\(query\(collection\(this\.db,\.\.\.this\.root,'operations'\)/);
console.log('V2: confirmação autoritativa e recuperação condicional presentes (estático).');

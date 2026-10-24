// Proteção estática P0: não fazer leitura integral a cada login, mas exigir dados
// autoritativos antes de receber fiado ou fechar o caixa.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../../src/App.jsx',import.meta.url),'utf8');
const ledger=readFileSync(new URL('../../src/core/financialLedger.js',import.meta.url),'utf8');
assert.match(app,/telaPrecisaLivroCompleto = ecraAtual === 'clientes' \|\| ecraAtual === 'auditoria_caixas'/);
assert.match(app,/if \(!telaPrecisaLivroCompleto\) return;/);
assert.match(app,/\[userId, telaPrecisaLivroCompleto\]/);
assert.match(app,/ecraAtual === 'clientes' && \(livroFinanceiroConfirmado \?/);
assert.match(app,/ecraAtual === 'auditoria_caixas' && \(livroFinanceiroConfirmado \?/);
assert.match(app,/await consultarLivroFinanceiroSessaoServidor\(\{ db, userId, sessaoId:sessaoAtiva.id \}\)/);
assert.match(app,/livroFinanceiro:livroSessaoConfirmado/);
assert.match(ledger,/getDocsFromServer\(query\(/);
assert.match(ledger,/where\('sessaoId', '==', String\(sessaoId\)\)/);
assert.match(ledger,/return snap.docs.map/);
console.log('P0: full ledger on demand, fail-closed clients/audit, fresh session close.');

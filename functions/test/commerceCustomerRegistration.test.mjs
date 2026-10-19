import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Regressao: cadastro opcional nunca altera Financeiro, V1/V2 ou dados de outra loja.
// O restante do fluxo transacional e provado no Firestore Emulator do Commerce CI.
const pub=readFileSync(new URL('../src/commerceOrders.js',import.meta.url),'utf8');
const storefront=readFileSync(new URL('../../src/components/ZenCommerceStorefront.jsx',import.meta.url),'utf8');
const api=readFileSync(new URL('../../src/core/commercePublicApi.js',import.meta.url),'utf8');
test('cadastro opt-in e transacao pertencem ao mesmo lojaId autenticado',()=>{
 assert.match(pub,/lojas\/\$\{lojaId\}\/commerce_clientes\/\$\{hash\}/);
 assert.match(pub,/tx\.set\(clienteRef,\{/);
 assert.match(pub,/marketingAutorizado:false/);
 assert.match(pub,/titularidadeVerificada:false/);
 assert.match(pub,/const anterior=await tx\.get\(clienteRef\)/);
 assert.match(pub,/if\(pedido\.cadastroSolicitado\)/);
 assert.match(pub,/tx\.create\(ref,data\)/);
 assert.match(pub,/if\(action==='listarClientesOnline'\)/);
 assert.match(pub,/autorizarOperadorCommerce\(request\.auth,db,request\.data\?\.sessaoZenOS\)/);
 assert.doesNotMatch(pub,/tx\.(?:set|update)\(db\.doc\(`lojas\/\$\{lojaId\}\/dados\/operacao`/);
});
test('nenhum carrinho, recibo ou cliente e persistido localmente',()=>{
 assert.doesNotMatch(storefront,/sessionStorage\.setItem|localStorage\.setItem/);
 assert.match(storefront,/sessionStorage\.removeItem\(chaveSessao\(idPublico\)\)/);
 assert.match(storefront,/setCarrinho\(\{\}\);setCliente\(novoCliente\(\)\);setRecibo\(r\)/);
 assert.match(api,/inMemoryPersistence/);
 assert.doesNotMatch(api,/browserSessionPersistence/);
});

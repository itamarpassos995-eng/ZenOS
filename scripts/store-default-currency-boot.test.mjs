import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolverMoedaExibidaAoCarregarConfiguracao as resolve} from '../src/core/storeDefaultCurrency.js';

test('VIPE: novo login sempre carrega PYG salvo, nunca BRL temporário da inicialização',()=>{
 assert.equal(resolve({visivelAtual:'BRL',padraoAnterior:'PYG',padraoSalvo:'PYG',
  primeiraConfiguracao:true,escolhaManual:false}),'PYG');
 assert.equal(resolve({visivelAtual:'BRL',padraoAnterior:'BRL',padraoSalvo:'PYG',
  primeiraConfiguracao:true,escolhaManual:false}),'PYG');
});
test('segunda leitura de configuração não sobrescreve escolha manual do operador',()=>{
 assert.equal(resolve({visivelAtual:'BRL',padraoAnterior:'PYG',padraoSalvo:'PYG',
  primeiraConfiguracao:false,escolhaManual:true}),'BRL');
});
test('mudança da moeda padrão no servidor atualiza usuário seguindo configuração',()=>{
 assert.equal(resolve({visivelAtual:'PYG',padraoAnterior:'PYG',padraoSalvo:'USD',
  primeiraConfiguracao:false,escolhaManual:false}),'USD');
});
test('nova sessão reseta as referências e não herda configuração de outra loja',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/moedaPadraoInicialCarregadaRef\.current=false/);
 assert.match(app,/moedaEscolhaManualRef\.current=false/);
 assert.match(app,/moedaPadraoAnteriorRef\.current='BRL'/);
 assert.match(app,/primeiraConfiguracao:primeiraConfigDaSessao/);
 assert.match(app,/moedaEscolhaManualRef\.current = true/);
});
test('o botão salvar padrão permanece explícito; não altera documento financeiro',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/\{moedaPadrao:moeda,updatedAtClient:/);
 const helper=readFileSync(new URL('../src/core/storeDefaultCurrency.js',import.meta.url),'utf8');
 assert.doesNotMatch(helper,/firebase|firestore|setDoc|onSnapshot|runTransaction|converterDeBRL|taxasCambio/);
});

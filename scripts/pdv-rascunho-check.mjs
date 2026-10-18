import assert from 'node:assert/strict';
import fs from 'node:fs';
import { salvarRascunhoPDV, lerRascunhoPDV, apagarRascunhoPDV, chaveRascunhoPDV } from '../src/core/pdvDraft.js';

const dados = new Map();
globalThis.localStorage = {
  getItem: chave => dados.get(chave) ?? null,
  setItem: (chave, valor) => dados.set(chave, valor),
  removeItem: chave => dados.delete(chave),
};

const chave = chaveRascunhoPDV('loja-a', 'operador-1');
assert(chave.includes('loja-a') && chave.includes('operador-1'));
assert.notEqual(chave, chaveRascunhoPDV('loja-b', 'operador-1'));
assert.notEqual(chave, chaveRascunhoPDV('loja-a', 'operador-2'));
assert.equal(lerRascunhoPDV('loja-a', 'operador-1'), null);

const carrinho = {
  itensVenda: [
    { id:'linha-1', produtoOriginalId:'produto-7', produtoOriginalSku:'SKU-7',
      nome:'Teste 30 itens', qtd:'30', precoPraticadoBRL:12.5,
      usoUnicoEncomendado:false, imagem:'data:image/png;base64,XXX', fotos:['foto'] },
  ],
  descontoTexto:'5', nomeClienteVulso:'Cliente',
  clienteSelecionadoPDV:{ id:'cli-7', nome:'Cliente' },
  clienteQuerFiscal:false, pagamentosLancados:[{id:17,formaId:'dinheiro_brl',valorOriginal:370}],
  prePedidoEmAbertoId:null, modalFechamentoAberto:true,
  operacaoDocumento:{ assinatura:'imutavel', id:'VENDA-17', instante:'2026-10-17T17:30:00.000Z' },
};
assert.equal(salvarRascunhoPDV('loja-a','operador-1',carrinho), true);
const restaurado=lerRascunhoPDV('loja-a','operador-1');
assert.equal(restaurado.itensVenda[0].qtd,'30');
assert.equal(restaurado.itensVenda[0].produtoOriginalSku,'SKU-7');
assert.equal(restaurado.itensVenda[0].precoPraticadoBRL,12.5);
assert.equal(restaurado.itensVenda[0].imagem,undefined);
assert.equal(restaurado.itensVenda[0].fotos,undefined);
assert.deepEqual(restaurado.operacaoDocumento,carrinho.operacaoDocumento);
assert.deepEqual(restaurado.pagamentosLancados,carrinho.pagamentosLancados);
assert.equal(lerRascunhoPDV('loja-b','operador-1'),null);
assert.equal(lerRascunhoPDV('loja-a','operador-2'),null);

// Falha de commit não remove o atendimento; somente confirmação/cancelamento explícito.
assert.equal(lerRascunhoPDV('loja-a','operador-1').itensVenda.length,1);
apagarRascunhoPDV('loja-a','operador-1');
assert.equal(lerRascunhoPDV('loja-a','operador-1'),null);
salvarRascunhoPDV('loja-a','operador-1',carrinho);
salvarRascunhoPDV('loja-a','operador-1',{itensVenda:[],prePedidoEmAbertoId:null});
assert.equal(lerRascunhoPDV('loja-a','operador-1'),null);

const pdv=fs.readFileSync(new URL('../src/components/PDV.jsx',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const v2=fs.readFileSync(new URL('../src/core/operationalV2.js',import.meta.url),'utf8');
assert.match(pdv,/useState\(\(\) => lerRascunhoPDV\(userId, operadorAtivo\?\.id\)\)/);
assert.match(pdv,/const instanteVenda = new Date\(operacaoDocumentoRef\.current\.instante/);
assert.match(pdv,/if \(!rascunhoSeguro\)/);
assert.match(pdv,/if \(!confirmado\?\.cloudOk\)[\s\S]*?return;/);
assert.match(pdv,/apagarRascunhoPDV\(userId, operadorAtivo\?\.id\);\s*setVendaConcluidaObj/);
assert.match(pdv,/operationKey: `pdv:\$\{vendaId\}`/);
assert.match(pdv,/\['V2_REUSE_ID','ZENOS_ENTITY_DELETED_REMOTE'\]\.includes\(confirmado\?\.error\?\.code\)/);
assert.match(app,/recarregarDadosPDV=\{recarregarDadosPDV\}/);
assert.match(v2,/if\(cached\?\.deleted&&after\.has\(id\)\)throw v2Error\('V2_REUSE_ID'/);
console.log('PDV: rascunho por operador/loja, dados mínimos, retry idempotente e tombstone preservado — OK');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';
import { aplicarEventoFiscalInterno, criarFiscalOperationKey, criarRascunhoFiscal, listarPendenciasFiscais, STATUS_FISCAIS } from '../src/core/fiscalCore.js';
import { BrazilFiscalAdapter, ParaguayFiscalAdapter, selecionarFiscalAdapter } from '../src/core/fiscalAdapters.js';
import { criarFiscalGateway } from '../src/core/fiscalGateway.js';
import { criarFiscalRepository } from '../src/core/fiscalRepository.js';
import { calcularComissaoVenda } from '../src/core/commissionEngine.js';
import { obterFinanceiroVenda } from '../src/core/salesFinancials.js';
import { calcularResumoSessao } from '../src/core/cashSession.js';

let aprovados = 0;
const check = async (nome, testar) => {
  await testar();
  aprovados += 1;
  console.log(`[OK] ${nome}`);
};
const perfilLoja = { pais:'BR', razaoSocial:'Loja teste', documento1:'DOCUMENTO-TESTE', endereco:'Endereco teste', cidade:'Cidade teste' };
const cliente = { id:'C1', nome:'Cliente teste', pais:'BR', documento:'DOCUMENTO-TESTE', endereco:'Endereco teste' };
const venda = {
  id:'VENDA-1', lojaId:'LOJA-1', estado:'concluida', clienteQuerFiscal:true, clienteId:'C1', clienteNome:cliente.nome,
  createdAt:'2026-10-10T10:00:00.000Z', vendedorId:'admin', totalBRL:50, lucroBRL:30, cmvBRL:20, trocoBRL:0,
  itens:[{ id:'I1', produtoOriginalId:'P1', sku:'P1', nome:'Produto teste', qtd:1, precoPraticadoBRL:50, custoBRL:20, custoNaVendaBRL:20, ncm:'REVISAR', ivaParaguai:'REVISAR' }],
  pagamentos:[{ id:'PG1', formaId:'dinheiro_brl', moedaOrigem:'BRL', valorOriginal:50, valorConvertidoBRL:50 }],
  taxasCambio:{ BRL:1, PYG:1400 },
};
const estadoComercial = {
  venda, produtos:[{ id:'P1', estoque:9, estoqueVitrine:0, estoqueGalpao:9, custoBRL:20, ultimoCustoFornecedorBRL:15 }],
  clientes:[cliente], caixaMovimentos:[], financeiro:[{ id:'L1', valor:50 }], vouchers:[],
};
const antes = JSON.stringify(estadoComercial);
const sessao = { id:'SESSAO-1', createdAt:'2026-10-10T09:00:00.000Z', operadorId:'admin', saldoInicial:0 };
const caixaAntes = calcularResumoSessao({ sessao, historicoVendas:[venda] });
const financeiroAntes = obterFinanceiroVenda(venda);
const comissaoAntes = calcularComissaoVenda(venda);
const dados = { lojaId:'LOJA-1', perfilLoja, venda, cliente, tipoDocumento:'nfce', createdAt:'2026-10-10T11:00:00.000Z' };
let documento;

await check('Rascunho copia venda sem alterar nenhum dado comercial', () => {
  documento = criarRascunhoFiscal(dados);
  assert.equal(JSON.stringify(estadoComercial), antes);
  assert.equal(documento.statusFiscal, 'rascunho');
  assert.equal(documento.totaisComerciaisSnapshot.totalBRL, 50);
});
await check('Estoque, CF e custo medio permanecem intactos', () => assert.equal(JSON.stringify(estadoComercial), antes));
await check('Caixa e financeiro permanecem intactos', () => {
  assert.deepEqual(calcularResumoSessao({ sessao, historicoVendas:[venda] }), caixaAntes);
  assert.equal(JSON.stringify(estadoComercial), antes);
});
await check('CMV, lucro, margem e comissao permanecem intactos', () => {
  assert.deepEqual(obterFinanceiroVenda(venda), financeiroAntes);
  assert.deepEqual(calcularComissaoVenda(venda), comissaoAntes);
});
await check('Rejeicao fiscal nao desfaz venda e evento repetido e idempotente', () => {
  const enviando = { ...structuredClone(documento), statusFiscal:'enviando' };
  const evento = { id:'EVENTO-REJEICAO', statusFiscal:'rejeitado', createdAt:'2026-10-10T11:01:00.000Z', codigoErro:'TESTE', mensagem:'Fixture de rejeicao interna' };
  const rejeitado = aplicarEventoFiscalInterno({ documento:enviando, lojaId:'LOJA-1', evento });
  assert.equal(rejeitado.statusFiscal, 'rejeitado');
  assert.deepEqual(aplicarEventoFiscalInterno({ documento:rejeitado, lojaId:'LOJA-1', evento }), rejeitado);
  assert.throws(() => aplicarEventoFiscalInterno({ documento:rejeitado, lojaId:'LOJA-1', evento:{ ...evento, mensagem:'Outro evento' } }), { code:'FISCAL_EVENTO_CONFLITANTE' });
  assert.equal(JSON.stringify(estadoComercial), antes);
  assert.deepEqual(rejeitado.totaisComerciaisSnapshot, documento.totaisComerciaisSnapshot);
});
await check('Cancelar rascunho fiscal nao cancela venda comercial', () => {
  const cancelado = aplicarEventoFiscalInterno({ documento, lojaId:'LOJA-1', evento:{ id:'CANCELAR-RASCUNHO', statusFiscal:'cancelado', createdAt:'2026-10-10T11:02:00.000Z' } });
  assert.equal(cancelado.statusFiscal, 'cancelado');
  assert.equal(venda.estado, 'concluida');
  assert.equal(JSON.stringify(estadoComercial), antes);
});
await check('Documento homologado nao remove pendencia de producao', () => {
  const autorizadoHomologacao = { ...documento, statusFiscal:'autorizado' };
  assert.equal(listarPendenciasFiscais({ lojaId:'LOJA-1', vendas:[venda], documentos:[autorizadoHomologacao], ambiente:'producao' }).length, 1);
  assert.equal(listarPendenciasFiscais({ lojaId:'LOJA-1', vendas:[venda], documentos:[autorizadoHomologacao], ambiente:'homologacao' }).length, 0);
});
await check('Nenhuma autorizacao ou transmissao pode ser simulada', async () => {
  for (const statusFiscal of ['enviando', 'autorizado']) {
    assert.throws(() => aplicarEventoFiscalInterno({ documento, lojaId:'LOJA-1', evento:{ id:statusFiscal, statusFiscal, createdAt:documento.createdAt } }), { code:'FISCAL_TRANSICAO_BLOQUEADA' });
  }
  for (const adapter of [BrazilFiscalAdapter, ParaguayFiscalAdapter]) {
    for (const metodo of ['emitir', 'consultar', 'cancelar', 'corrigir', 'gerarRepresentacao', 'obterDocumentoEletronico']) {
      await assert.rejects(adapter[metodo](), { code:'FISCAL_NAO_CONFIGURADO' });
    }
  }
});
await check('BR e PY selecionam adapter exclusivamente pelo pais da loja', () => {
  assert.equal(selecionarFiscalAdapter(perfilLoja), BrazilFiscalAdapter);
  assert.equal(selecionarFiscalAdapter({ ...perfilLoja, pais:'PY' }), ParaguayFiscalAdapter);
  for (const pais of ['', undefined, null, 'US', 'br', 1]) {
    assert.throws(() => selecionarFiscalAdapter({ pais }), { code:'FISCAL_PAIS_NAO_SUPORTADO' });
  }
  assert.throws(() => selecionarFiscalAdapter(null), { code:'FISCAL_PAIS_NAO_SUPORTADO' });
  const py = criarRascunhoFiscal({ ...dados, perfilLoja:{ ...perfilLoja, pais:'PY' }, tipoDocumento:'factura_electronica' });
  assert.equal(py.moeda, 'PYG');
  assert.equal(py.metadata.moedaComercial, null);
  assert.equal(py.totaisOriginaisSnapshot, null);
  assert.equal(py.totaisComerciaisSnapshot.totalBRL, 50);
  assert.equal(py.tributosSnapshot, null);
  assert.equal(BrazilFiscalAdapter.validarCadastro({ perfilLoja }).aptoParaTransmissao, false);
  assert.throws(() => criarRascunhoFiscal({ ...dados, tipoDocumento:'factura_electronica' }), { code:'FISCAL_TIPO_INVALIDO' });
});
await check('Moeda e totais originais BR/PY sao preservados sem conversao gerencial inventada', () => {
  for (const [pais, moedaComercial, tipoDocumento] of [['BR', 'BRL', 'nfce'], ['PY', 'PYG', 'factura_electronica']]) {
    const entrada = structuredClone(dados);
    entrada.perfilLoja.pais = pais;
    entrada.venda.moedaComercial = moedaComercial;
    entrada.venda.totaisComerciais = { subtotal:70000, desconto:1000, total:69000, troco:0 };
    entrada.tipoDocumento = tipoDocumento;
    const original = JSON.stringify(entrada);
    const fiscal = criarRascunhoFiscal(entrada);
    assert.equal(fiscal.moedaComercial, moedaComercial);
    assert.equal(fiscal.moedaFiscal, moedaComercial);
    assert.equal(fiscal.totaisOriginaisSnapshot.total, 69000);
    assert.equal(fiscal.valoresGerenciaisSnapshot.totalBRL, 50);
    assert.equal(fiscal.valoresGerenciaisSnapshot.moeda, 'BRL');
    assert.equal(JSON.stringify(entrada), original);
    entrada.venda.totaisComerciais.total = 1;
    assert.equal(fiscal.totaisOriginaisSnapshot.total, 69000);
    delete entrada.venda.totalBRL;
    assert.equal(criarRascunhoFiscal(entrada).valoresGerenciaisSnapshot.totalBRL, null);
  }
  const lojaPy = { ...perfilLoja, pais:'PY', moeda:'PYG', moedaFiscal:'USD' };
  const fiscal = criarRascunhoFiscal({ ...dados, perfilLoja:lojaPy, tipoDocumento:'factura_electronica' });
  assert.equal(fiscal.moedaComercial, 'PYG');
  assert.equal(fiscal.moedaFiscal, 'USD');
  assert.equal(fiscal.totaisOriginaisSnapshot, null);
  assert.throws(() => criarRascunhoFiscal({ ...dados, venda:{ ...venda, moedaComercial:'', totaisComerciais:{ total:50 } } }), { code:'FISCAL_MOEDA_INVALIDA' });
});
await check('Snapshots sobrevivem a alteracoes posteriores dos cadastros e venda', () => {
  const copia = structuredClone(dados);
  const snapshot = criarRascunhoFiscal(copia);
  copia.perfilLoja.razaoSocial = 'Alterada';
  copia.cliente.nome = 'Alterado';
  copia.venda.itens[0].nome = 'Alterado';
  copia.venda.pagamentos[0].valorOriginal = 99;
  assert.equal(snapshot.dadosEmitenteSnapshot.razaoSocial, perfilLoja.razaoSocial);
  assert.equal(snapshot.dadosDestinatarioSnapshot.nome, cliente.nome);
  assert.equal(snapshot.itensSnapshot[0].nome, venda.itens[0].nome);
  assert.equal(snapshot.pagamentosSnapshot[0].valorOriginal, 50);
});
await check('Venda legada sem intencao nao e migrada nem enfileirada', () => {
  const legada = { ...venda };
  delete legada.clienteQuerFiscal;
  const original = JSON.stringify(legada);
  assert.deepEqual(listarPendenciasFiscais({ lojaId:'LOJA-1', vendas:[legada] }), []);
  assert.throws(() => criarRascunhoFiscal({ ...dados, venda:legada }), { code:'FISCAL_VENDA_INELEGIVEL' });
  assert.equal(JSON.stringify(legada), original);
  const avulsa = criarRascunhoFiscal({ ...dados, cliente:null });
  assert.equal(avulsa.dadosDestinatarioSnapshot.documento, null);
  assert.equal(avulsa.metadata.descontoGlobalBRL, null);
});
await check('Impacto fiscal nao calculado e separado do resultado comercial', () => {
  assert.equal(documento.impactoFiscalSnapshot, null);
  assert.equal(documento.cargaFiscalPercentual, null);
  const fixtureImpacto = { ...structuredClone(documento), impactoFiscalSnapshot:{ origem:'fixture-teste', valorBRL:3 } };
  assert.deepEqual(obterFinanceiroVenda(venda), financeiroAntes);
  assert.deepEqual(calcularComissaoVenda(venda), comissaoAntes);
  assert.equal(fixtureImpacto.totaisComerciaisSnapshot.cmvBRL, 20);
  assert.equal(JSON.stringify(estadoComercial), antes);
});

// Infraestrutura somente do teste: serializa transacoes compartilhadas entre abas.
const armazenamento = new Map();
const travas = new Map();
let fila = Promise.resolve();
let gravacoes = 0;
const transacionar = callback => {
  const execucao = fila.then(() => callback({
    obterDocumento:(loja, key) => { assert.equal(loja, 'LOJA-1'); return structuredClone(armazenamento.get(key)); },
    obterTravaVenda:(loja, key) => { assert.equal(loja, 'LOJA-1'); return structuredClone(travas.get(key)); },
    obterContextoVenda:(loja, id) => {
      assert.equal(loja, 'LOJA-1');
      return { lojaId:loja, perfilLoja, venda:{ ...venda, id }, cliente };
    },
    salvarTravaVenda:(loja, key, value) => { assert.equal(loja, 'LOJA-1'); travas.set(key, structuredClone(value)); },
    salvarDocumento:(loja, key, value) => { assert.equal(loja, 'LOJA-1'); armazenamento.set(key, structuredClone(value)); gravacoes += 1; },
  }));
  fila = execucao.then(() => undefined, () => undefined);
  return execucao;
};
const backend = criarFiscalRepository({ lojaId:'LOJA-1', transacionar });
const abaA = criarFiscalGateway({ lojaId:'LOJA-1', perfilLoja, backend });
const abaB = criarFiscalGateway({ lojaId:'LOJA-1', perfilLoja, backend });
const comando = { vendaId:venda.id, tipoDocumento:'nfce' };
await check('Duas abas, duplo clique e retry reservam um unico documento', async () => {
  const resultados = await Promise.all(Array.from({ length:12 }, (_, index) => (index % 2 ? abaA : abaB).criarRascunho(comando)));
  assert.equal(armazenamento.size, 1);
  assert.equal(gravacoes, 1);
  assert.ok(resultados.every(resultado => resultado.id === resultados[0].id));
  resultados[0].itensSnapshot[0].nome = 'Nao pode alterar backend';
  assert.equal((await abaB.criarRascunho(comando)).itensSnapshot[0].nome, venda.itens[0].nome);
});
await check('Refresh, resposta tardia e timeout preservam a mesma reserva', async () => {
  const resposta = await abaA.criarRascunho(comando);
  const aposRefresh = criarFiscalGateway({ lojaId:'LOJA-1', perfilLoja, backend });
  const perdaResposta = criarFiscalGateway({ lojaId:'LOJA-1', perfilLoja, backend:{ criarRascunho:async entrada => { await backend.criarRascunho(entrada); throw new Error('Timeout simulado'); } } });
  await assert.rejects(perdaResposta.criarRascunho(comando), /Timeout simulado/);
  assert.equal((await aposRefresh.criarRascunho(comando)).id, resposta.id);
  assert.equal(gravacoes, 1);
  assert.notEqual(criarFiscalOperationKey({ lojaId:'LOJA-1', vendaId:venda.id, tipoDocumento:'nfce', ambiente:'producao' }), resposta.fiscalOperationKey);
});
await check('Trava por venda bloqueia tipos BR conflitantes e separa vendas e ambientes', async () => {
  await assert.rejects(abaB.criarRascunho({ ...comando, tipoDocumento:'nfe' }), { code:'FISCAL_TIPO_CONFLITANTE' });
  assert.equal(armazenamento.size, 1);
  const outraVenda = await abaB.criarRascunho({ vendaId:'VENDA-2', tipoDocumento:'nfe' });
  const producao = await abaA.criarRascunho({ ...comando, tipoDocumento:'nfe', ambiente:'producao' });
  assert.notEqual(outraVenda.fiscalSaleLockKey, documento.fiscalSaleLockKey);
  assert.notEqual(producao.fiscalSaleLockKey, documento.fiscalSaleLockKey);
  assert.equal(armazenamento.size, 3);
  assert.equal(travas.size, 3);
  const conflitosSimultaneos = await Promise.allSettled([
    abaA.criarRascunho({ vendaId:'VENDA-3', tipoDocumento:'nfe' }),
    abaB.criarRascunho({ vendaId:'VENDA-3', tipoDocumento:'nfce' }),
  ]);
  assert.equal(conflitosSimultaneos.filter(resultado => resultado.status === 'fulfilled').length, 1);
  assert.equal(conflitosSimultaneos.find(resultado => resultado.status === 'rejected').reason.code, 'FISCAL_TIPO_CONFLITANTE');
});
await check('Contexto, perfil, venda e cliente cruzados sao rejeitados; legado usa leitura escopada', async () => {
  for (const campo of ['contexto', 'perfilLoja', 'venda', 'cliente']) {
    let gravou = false;
    const repositorio = criarFiscalRepository({
      lojaId:'LOJA-1',
      transacionar:callback => callback({
        obterDocumento:() => null, obterTravaVenda:() => null,
        obterContextoVenda:(loja, id) => {
          assert.equal(loja, 'LOJA-1');
          assert.equal(id, venda.id);
          const contexto = structuredClone({ perfilLoja, venda, cliente });
          if (campo === 'contexto') contexto.lojaId = 'LOJA-2';
          else contexto[campo].lojaId = 'LOJA-2';
          return contexto;
        },
        salvarTravaVenda:() => { gravou = true; }, salvarDocumento:() => { gravou = true; },
      }),
    });
    await assert.rejects(criarFiscalGateway({ lojaId:'LOJA-1', perfilLoja, backend:repositorio }).criarRascunho(comando), { code:'FISCAL_LOJA_DIVERGENTE' });
    assert.equal(gravou, false);
  }
  const contextoLegado = structuredClone({ perfilLoja, venda, cliente });
  delete contextoLegado.venda.lojaId;
  const antesLegado = JSON.stringify(contextoLegado);
  const repositorioLegado = criarFiscalRepository({
    lojaId:'LOJA-1',
    transacionar:callback => callback({
      obterDocumento:() => null, obterTravaVenda:() => null,
      obterContextoVenda:(loja, id) => {
        assert.equal(loja, 'LOJA-1');
        assert.equal(id, venda.id);
        return contextoLegado;
      },
      salvarTravaVenda:(loja, key, value) => {
        assert.equal(loja, 'LOJA-1');
        assert.equal(value.fiscalSaleLockKey, key);
      },
      salvarDocumento:(loja, key, value) => {
        assert.equal(loja, 'LOJA-1');
        assert.equal(value.fiscalOperationKey, key);
      },
    }),
  });
  const resultadoLegado = await criarFiscalGateway({ lojaId:'LOJA-1', perfilLoja, backend:repositorioLegado }).criarRascunho(comando);
  assert.equal(resultadoLegado.lojaId, 'LOJA-1');
  assert.equal(JSON.stringify(contextoLegado), antesLegado);
});
await check('Itens e fila preservam originais explicitos e identificam BRL legado sem inferencia', () => {
  const entrada = structuredClone(dados);
  entrada.perfilLoja.pais = 'PY';
  entrada.tipoDocumento = 'factura_electronica';
  entrada.venda.moedaComercial = 'PYG';
  entrada.venda.totaisComerciais = { total:70000 };
  entrada.venda.itens[0].precoTexto = '70000,00';
  entrada.venda.itens[0].valoresOriginais = { moeda:'PYG', precoUnitario:70000, total:70000, desconto:0 };
  const original = JSON.stringify(entrada);
  const snapshot = criarRascunhoFiscal(entrada);
  assert.equal(snapshot.itensSnapshot[0].valoresOriginaisSnapshot.precoUnitario, 70000);
  assert.equal(snapshot.itensSnapshot[0].valoresOriginaisSnapshot.moeda, 'PYG');
  assert.equal(snapshot.itensSnapshot[0].precoPraticadoBRL, 50);
  assert.equal(snapshot.itensSnapshot[0].precoTexto, '70000,00');
  assert.equal(snapshot.totaisComerciaisSnapshot.moeda, 'BRL');
  assert.equal(snapshot.totaisComerciaisSnapshot.semantica, 'valores_gerenciais_legados_brl');
  const pendente = listarPendenciasFiscais({ lojaId:'LOJA-1', vendas:[entrada.venda] })[0];
  assert.equal(pendente.moedaComercial, 'PYG');
  assert.equal(pendente.totalComercialOriginal, 70000);
  assert.equal(pendente.totalBRL, 50);
  assert.equal(JSON.stringify(entrada), original);
  entrada.venda.itens[0].valoresOriginais.total = 1;
  assert.equal(snapshot.itensSnapshot[0].valoresOriginaisSnapshot.total, 70000);
  const legado = criarRascunhoFiscal(dados);
  assert.equal(legado.itensSnapshot[0].valoresOriginaisSnapshot, null);
  const filaLegada = listarPendenciasFiscais({ lojaId:'LOJA-1', vendas:[venda] })[0];
  assert.equal(filaLegada.moedaComercial, null);
  assert.equal(filaLegada.totalComercialOriginal, null);
  assert.equal(filaLegada.totalBRL, 50);
  assert.equal(filaLegada.exigeRevisao, true);
  delete entrada.venda.itens[0].valoresOriginais.moeda;
  assert.throws(() => criarRascunhoFiscal(entrada), { code:'FISCAL_MOEDA_INVALIDA' });
  delete entrada.venda.moedaComercial;
  assert.throws(() => listarPendenciasFiscais({ lojaId:'LOJA-1', vendas:[entrada.venda] }), { code:'FISCAL_MOEDA_INVALIDA' });
});
await check('Loja diferente, resposta cruzada e chave adulterada sao bloqueadas', async () => {
  await assert.rejects(criarFiscalGateway({ lojaId:'LOJA-2', perfilLoja, backend }).criarRascunho(comando), { code:'FISCAL_LOJA_DIVERGENTE' });
  const cruzado = criarFiscalGateway({ lojaId:'LOJA-2', perfilLoja, backend:{ criarRascunho:async () => documento } });
  await assert.rejects(cruzado.criarRascunho(comando), { code:'FISCAL_LOJA_DIVERGENTE' });
  await assert.rejects(backend.criarRascunho({ ...comando, lojaId:'LOJA-1', fiscalOperationKey:'adulterada' }), { code:'FISCAL_IDENTIDADE_INVALIDA' });
  assert.throws(() => listarPendenciasFiscais({ lojaId:'LOJA-2', documentos:[documento] }), { code:'FISCAL_LOJA_DIVERGENTE' });
  assert.throws(() => criarRascunhoFiscal({ ...dados, lojaId:'LOJA-2' }), { code:'FISCAL_LOJA_DIVERGENTE' });
});
await check('Sem backend nao ha sucesso ficticio, cache ou persistencia local', async () => {
  const gateway = criarFiscalGateway({ lojaId:'LOJA-1', perfilLoja });
  assert.equal(gateway.configurado, false);
  await assert.rejects(gateway.criarRascunho(comando), { code:'FISCAL_BACKEND_NAO_CONFIGURADO' });
});
await check('Fila deduplica vendas, respeita estados e nao reemite cancelados', () => {
  assert.equal(listarPendenciasFiscais({ lojaId:'LOJA-1', vendas:[venda, venda] }).length, 1);
  for (const statusFiscal of STATUS_FISCAIS) {
    const filaFiscal = listarPendenciasFiscais({ lojaId:'LOJA-1', vendas:[venda], documentos:[{ ...documento, statusFiscal }] });
    assert.equal(filaFiscal.length, ['autorizado', 'cancelado'].includes(statusFiscal) ? 0 : 1);
  }
  assert.deepEqual(listarPendenciasFiscais({ lojaId:'LOJA-1', vendas:[{ ...venda, estado:'pendente' }, { ...venda, estado:'cancelada' }] }), []);
  assert.equal(JSON.stringify(estadoComercial), antes);
});
await check('Snapshots nao copiam credenciais nem metadata arbitraria', () => {
  const perigoso = { ...dados, perfilLoja:{ ...perfilLoja, tokenProvedor:'fixture-nao-secreta' }, cliente:{ ...cliente, senha:'fixture-nao-secreta' } };
  const copia = criarRascunhoFiscal(perigoso);
  assert.equal(Object.hasOwn(copia.dadosEmitenteSnapshot, 'tokenProvedor'), false);
  assert.equal(Object.hasOwn(copia.dadosDestinatarioSnapshot, 'senha'), false);
  for (const arquivo of ['fiscalCore.js', 'fiscalAdapters.js', 'fiscalGateway.js', 'fiscalRepository.js']) {
    const source = fs.readFileSync(new URL(`../src/core/${arquivo}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /import\s+.*(?:firebase|productionSync|inventory|financialLedger|commissionEngine|salesFinancials)/);
    assert.doesNotMatch(source, /\b(?:localStorage|zenosStorage|fetch|setDoc|writeBatch|runTransaction)\s*[.(]/);
    assert.doesNotMatch(source, /-----BEGIN (?:PRIVATE KEY|CERTIFICATE)-----/);
  }
});
await check('Intencao no PDV e aditiva, recuperada no pre-pedido e limpa na nova venda', async () => {
  const pdv = fs.readFileSync(new URL('../src/components/PDV.jsx', import.meta.url), 'utf8');
  assert.match(pdv, /const \[clienteQuerFiscal, setClienteQuerFiscal\] = useState\(false\)/);
  assert.match(pdv, /const novaVenda = \{[\s\S]*?clienteQuerFiscal,/);
  const carregar = pdv.match(/const carregarPrePedido = \(pedido\) => \{([\s\S]*?)\n  \};/);
  let intencao;
  const context = { itensVendaComCustoAtual:itens => itens, setItensVenda:() => {}, setClienteQuerFiscal:value => { intencao = value; }, setNomeClienteVulso:() => {}, setPrePedidoEmAbertoId:() => {}, setModalResgateAberto:() => {}, tx:pt => pt };
  for (const esperado of [true, false, undefined]) {
    runInNewContext(`(pedido => {${carregar[1]}})(pedido)`, { ...context, pedido:{ itens:[], clienteQuerFiscal:esperado, clienteNome:'Teste' } });
    assert.equal(intencao, esperado === true);
  }
  const limpar = pdv.match(/const limparParaNovaVenda = \(\) => \{([\s\S]*?)\n  \};/);
  assert.match(limpar[1], /setClienteQuerFiscal\(false\)/);
  assert.match(pdv, /type="checkbox" checked=\{clienteQuerFiscal\} disabled=\{processandoTransacao \|\| vendaSucesso\}/);
  const label = pdv.match(/<label[^>]*minHeight: '44px'[\s\S]*?<\/label>/);
  assert.ok(label, 'Controle fiscal com area de toque localizado');
  const jsx = await transformWithEsbuild(`(${label[0]})`, 'fiscal-checkbox.jsx', { loader:'jsx', jsxFactory:'React.createElement' });
  for (const [clienteQuerFiscal, processandoTransacao, vendaSucesso] of [[false, false, false], [true, false, false], [true, true, false], [true, false, true]]) {
    const html = renderToStaticMarkup(runInNewContext(jsx.code, { React, clienteQuerFiscal, processandoTransacao, vendaSucesso, setClienteQuerFiscal:() => {}, tx:pt => pt }));
    assert.match(html, /type="checkbox"/);
    assert.equal(html.includes('checked=""'), clienteQuerFiscal);
    assert.equal(html.includes('disabled=""'), processandoTransacao || vendaSucesso);
    assert.match(html, /min-height:44px/);
    assert.match(html, /flex-shrink:0/);
    assert.doesNotMatch(html, /min-width:/);
  }
});

await check('Pre-pedido persiste intencao, recarrega e converte em venda com intencao preservada', async () => {
  const pdv = fs.readFileSync(new URL('../src/components/PDV.jsx', import.meta.url), 'utf8');
  const objetoVenda = pdv.match(/const novaVenda = \{[\s\S]*?\n      \};/);
  const propostaHistorico = pdv.match(/let novoHist = Array\.isArray\(historicoVendas\)[\s\S]*?const historicoProposto = \[novaVenda, \.\.\.novoHist\];/);
  const changesHistorico = pdv.match(/const changes = \[\s*\{ field:'historicoVendas'[\s\S]*?\n        \];/);
  const commit = pdv.match(/const confirmado = await commitVendaCritica\(\{\s*changes,[\s\S]*?\n        \}\);/);
  const carregar = pdv.match(/const carregarPrePedido = \(pedido\) => \{([\s\S]*?)\n  \};/);
  assert.ok(objetoVenda && propostaHistorico && changesHistorico && commit && carregar);
  let persistidos = [];
  let intencao = true;
  const salvar = async (tipoFinalizacao, prePedidoEmAbertoId = null) => {
    const context = {
      tipoFinalizacao, prePedidoEmAbertoId, historicoVendas:persistidos, clienteQuerFiscal:intencao,
      vendaId:tipoFinalizacao === 'pre_pedido' ? 'PRE-TESTE' : 'VENDA-TESTE',
      instanteVenda:new Date('2026-10-10T10:00:00.000Z'), idioma:'pt', clienteSelecionadoPDV:null,
      nomeClienteVulso:'Cliente teste', tx:pt => pt, idSeguro:'admin', nomeSeguro:'Administrador',
      itensDocumento:structuredClone(venda.itens), totalFinalBRL:50, cmvVendaBRL:20, lucroEstimadoBRL:30,
      trocoTotalBRL:0, moedaTrocoEscolhida:'BRL', pagamentosLancados:structuredClone(venda.pagamentos),
      taxasCambio:{ BRL:1 }, docRotulo:'TESTE', estadoFinal:tipoFinalizacao === 'venda' ? 'concluida' : 'pendente',
      lancamentosFinanceirosVenda:[], eventosEstoqueVenda:[], guards:[],
      commitVendaCritica:async ({ changes }) => {
        assert.equal(changes[0].field, 'historicoVendas');
        persistidos = JSON.parse(JSON.stringify(changes[0].value));
        return { cloudOk:true, values:{ historicoVendas:persistidos } };
      },
    };
    await runInNewContext(`(async () => {${objetoVenda[0]}\n${propostaHistorico[0]}\n${changesHistorico[0]}\n${commit[0]}})()`, context);
  };
  await salvar('pre_pedido');
  assert.equal(persistidos[0].tipoDocumento, 'pre_pedido');
  assert.equal(persistidos[0].clienteQuerFiscal, true);
  const pedido = JSON.parse(JSON.stringify(persistidos[0]));
  intencao = false;
  runInNewContext(`(pedido => {${carregar[1]}})(pedido)`, {
    pedido, itensVendaComCustoAtual:itens => itens, setItensVenda:() => {},
    setClienteQuerFiscal:value => { intencao = value; }, setNomeClienteVulso:() => {},
    setPrePedidoEmAbertoId:() => {}, setModalResgateAberto:() => {}, tx:pt => pt,
  });
  assert.equal(intencao, true);
  await salvar('venda', pedido.id);
  assert.equal(persistidos.length, 1);
  assert.equal(persistidos[0].tipoDocumento, 'venda');
  assert.equal(persistidos[0].clienteQuerFiscal, true);
});

console.log(`\nFundacao Fiscal Fase 1: ${aprovados}/${aprovados} grupos aprovados. Sem backend real ou transmissao.`);

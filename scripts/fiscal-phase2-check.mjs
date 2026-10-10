import assert from 'node:assert/strict';
import fs from 'node:fs';
import { listarFilaFiscalOperacional, prepararPreviaFiscal } from '../src/core/fiscalUi.js';
import { TIPOS_FISCAIS } from '../src/core/fiscalCore.js';
import { chaveDiaLocal } from '../src/core/dates.js';

let aprovados = 0;
const check = (nome, testar) => {
  testar();
  aprovados += 1;
  console.log(`[OK] ${nome}`);
};
const perfilBR = { pais:'BR', razaoSocial:'Loja BR', documento1:'DOC', endereco:'Rua 1', cidade:'Cidade', moedaComercial:'BRL' };
const venda = {
  id:'VENDA-1', lojaId:'LOJA-1', estado:'concluida', clienteQuerFiscal:true, clienteId:'C1', clienteNome:'Cliente',
  createdAt:'2026-10-10T10:00:00.000Z', moedaComercial:'BRL', totaisComerciais:{ total:100 }, totalBRL:100,
  itens:[{ id:'I1', nome:'Produto', qtd:1, unidadeMedida:'UN', precoPraticadoBRL:100, valoresOriginais:{ moeda:'BRL', precoUnitario:100, total:100, desconto:0 } }],
  pagamentos:[{ id:'P1', formaId:'dinheiro_brl', moedaOrigem:'BRL', valorOriginal:100, valorConvertidoBRL:100 }],
};
const cliente = { id:'C1', nome:'Cliente', documento:'DOC-CLIENTE', endereco:'Rua 2', cidade:'Cidade', pais:'BR' };

check('Venda sem intenção fiscal não aparece e elegível aparece', () => {
  const fila = listarFilaFiscalOperacional({ lojaId:'LOJA-1', perfilLoja:perfilBR, vendas:[{ ...venda, clienteQuerFiscal:false }, venda] });
  assert.equal(fila.length, 1);
  assert.equal(fila[0].vendaId, 'VENDA-1');
});
check('Fila mantém isolamento por loja', () => {
  assert.throws(() => listarFilaFiscalOperacional({ lojaId:'LOJA-1', perfilLoja:perfilBR, vendas:[{ ...venda, lojaId:'LOJA-2' }] }), { code:'FISCAL_LOJA_DIVERGENTE' });
});
check('Fila usa exatamente o histórico visível para o operador', () => {
  const visivel = { ...venda, id:'VENDA-VISIVEL', vendedorId:'OPERADOR-1' };
  const oculta = { ...venda, id:'VENDA-OCULTA', vendedorId:'OPERADOR-2' };
  const historicoVisivelParaOperador = [visivel, oculta].filter(item => item.vendedorId === 'OPERADOR-1');
  const fila = listarFilaFiscalOperacional({ lojaId:'LOJA-1', perfilLoja:perfilBR, vendas:historicoVisivelParaOperador });
  assert.deepEqual(fila.map(item => item.vendaId), ['VENDA-VISIVEL']);

  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const derivacao = app.match(/const resultadoFilaFiscal = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[historicoVisivelParaOperador, perfilLoja, userId\]\);/);
  assert.ok(derivacao, 'useMemo fiscal deve depender do histórico visível');
  assert.match(derivacao[1], /vendas:historicoVisivelParaOperador/);
  assert.doesNotMatch(derivacao[1], /vendas:historicoVendas/);
});
check('BR e PY usam somente tipos previstos e país inválido falha', () => {
  assert.deepEqual(TIPOS_FISCAIS.BR, ['nfe', 'nfce', 'nfse']);
  assert.deepEqual(TIPOS_FISCAIS.PY, ['factura_electronica']);
  const py = prepararPreviaFiscal({ lojaId:'LOJA-1', perfilLoja:{ ...perfilBR, pais:'PY', moedaComercial:'PYG' }, venda:{ ...venda, moedaComercial:'PYG', totaisComerciais:{ total:700000 } }, clientes:[cliente], tipoDocumento:'factura_electronica' });
  assert.equal(py.snapshot.pais, 'PY');
  assert.throws(() => prepararPreviaFiscal({ lojaId:'LOJA-1', perfilLoja:{ ...perfilBR, pais:'US' }, venda, clientes:[cliente], tipoDocumento:'nfe' }), { code:'FISCAL_PAIS_NAO_SUPORTADO' });
});
check('Moeda original permanece separada da referência BRL', () => {
  const vendaPY = { ...venda, moedaComercial:'PYG', totaisComerciais:{ total:700000 }, totalBRL:500 };
  const fila = listarFilaFiscalOperacional({ lojaId:'LOJA-1', perfilLoja:{ ...perfilBR, pais:'PY', moedaComercial:'PYG' }, vendas:[vendaPY] });
  assert.equal(fila[0].moedaComercial, 'PYG');
  assert.equal(fila[0].totalComercialOriginal, 700000);
  assert.equal(fila[0].totalBRL, 500);
});
check('Venda legada exige revisão sem fabricar moeda ou total', () => {
  const legada = structuredClone(venda);
  delete legada.moedaComercial;
  delete legada.totaisComerciais;
  const fila = listarFilaFiscalOperacional({ lojaId:'LOJA-1', perfilLoja:{ ...perfilBR, moedaComercial:null }, vendas:[legada] });
  assert.equal(fila[0].moedaComercial, null);
  assert.equal(fila[0].totalComercialOriginal, null);
  assert.equal(fila[0].exigeRevisao, true);
});
check('Prévia é pura e não altera venda, estoque, caixa ou CMV', () => {
  const estado = { venda, estoque:9, caixa:100, cmv:40 };
  const antes = JSON.stringify(estado);
  const previa = prepararPreviaFiscal({ lojaId:'LOJA-1', perfilLoja:perfilBR, venda, clientes:[cliente], tipoDocumento:'nfce', createdAt:'2026-10-10T11:00:00.000Z' });
  assert.equal(previa.snapshot.statusFiscal, 'rascunho');
  assert.equal(JSON.stringify(estado), antes);
});
check('Interface não chama transmissão e mantém backend indisponível explícito', () => {
  const source = fs.readFileSync(new URL('../src/components/Fiscal.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.emitir\s*\(|\.cancelar\s*\(|\.corrigir\s*\(|\.consultar\s*\(|criarFiscalGateway|localStorage|setDoc|firebase/);
  assert.match(source, /Backend fiscal seguro ainda não configurado\./);
  assert.match(source, /disabled title="Backend fiscal seguro ainda não configurado\."/);
});
check('Estrutura mobile evita tabela e overflow horizontal obrigatório', () => {
  const component = fs.readFileSync(new URL('../src/components/Fiscal.jsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../src/components/Fiscal.css', import.meta.url), 'utf8');
  assert.match(component, /data-fiscal-mobile-safe="true"/);
  assert.doesNotMatch(component, /<table|overflowX/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.fiscal-linha\{grid-template-columns:1fr 1fr/);
  assert.match(css, /min-height:44px/);
});
check('Filtro fiscal usa a data civil local perto da virada UTC', () => {
  const timezoneAnterior = process.env.TZ;
  process.env.TZ = 'America/Asuncion';
  try {
    const instante = '2026-07-01T02:30:00.000Z';
    assert.equal(instante.slice(0, 10), '2026-07-01');
    assert.equal(chaveDiaLocal(instante), '2026-06-30');
  } finally {
    if (timezoneAnterior === undefined) delete process.env.TZ;
    else process.env.TZ = timezoneAnterior;
  }

  const component = fs.readFileSync(new URL('../src/components/Fiscal.jsx', import.meta.url), 'utf8');
  assert.match(component, /const dia = chaveDiaLocal\(item\.createdAt\) \|\| ''/);
  assert.doesNotMatch(component, /toISOString\(\)\.slice\(0,\s*10\)/);
});

console.log(`Fiscal Fase 2: ${aprovados} verificações aprovadas.`);

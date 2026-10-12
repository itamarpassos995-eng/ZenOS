import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { derivarFilaFiscalSegura } from '../src/core/fiscalUi.js';

let aprovados = 0;
const check = async (nome, testar) => {
  await testar();
  aprovados += 1;
  console.log(`[OK] ${nome}`);
};

const venda = {
  id:'VENDA-BOOT',
  lojaId:'LOJA-BOOT',
  estado:'concluida',
  clienteQuerFiscal:true,
  clienteNome:'Cliente boot',
  createdAt:'2026-10-10T12:00:00.000Z',
  totalBRL:100,
  moedaComercial:'BRL',
  totaisComerciais:{ total:100 },
  itens:[{ id:'ITEM-1', nome:'Produto', qtd:1, precoPraticadoBRL:100 }],
  pagamentos:[],
};

await check('Derivação fiscal é segura durante carregamento sem usuário', () => {
  assert.deepEqual(derivarFilaFiscalSegura({
    lojaId:null,
    perfilLoja:{},
    vendas:[],
  }), { fila:[], erro:null });
});

for (const pais of ['BR', 'PY']) {
  await check(`Derivação fiscal inicializa com perfil ${pais}`, () => {
    const resultado = derivarFilaFiscalSegura({
      lojaId:'LOJA-BOOT',
      perfilLoja:{ pais, moedaComercial:pais === 'PY' ? 'PYG' : 'BRL' },
      vendas:[pais === 'PY' ? { ...venda, moedaComercial:'PYG', totaisComerciais:{ total:700000 } } : venda],
      documentos:[],
    });
    assert.equal(resultado.erro, null);
    assert.equal(resultado.fila.length, 1);
  });
}

await check('País fiscal transitório inválido não derruba o boot', () => {
  const resultado = derivarFilaFiscalSegura({
    lojaId:'LOJA-BOOT',
    perfilLoja:{ pais:null },
    vendas:[venda],
    documentos:[],
  });
  assert.deepEqual(resultado.fila, []);
  assert.match(resultado.erro, /FISCAL_PAIS_NAO_SUPORTADO/);
});

await check('Venda fiscal inconsistente fica isolada como erro', () => {
  const resultado = derivarFilaFiscalSegura({
    lojaId:'LOJA-BOOT',
    perfilLoja:{ pais:'BR' },
    vendas:[{ ...venda, lojaId:'OUTRA-LOJA' }],
    documentos:[],
  });
  assert.deepEqual(resultado.fila, []);
  assert.match(resultado.erro, /FISCAL_LOJA_DIVERGENTE/);
});

const vite = await createServer({
  appType:'custom',
  logLevel:'silent',
  server:{ middlewareMode:true },
});

try {
  await check('App real renderiza estado inicial de autenticação sem tela branca', async () => {
    const { default:App } = await vite.ssrLoadModule('/src/App.jsx');
    const html = renderToStaticMarkup(React.createElement(App));
    assert.match(html, /A INICIAR SISTEMA/);
    assert.match(html, /ZenOS/);
  });

  await check('Fiscal renderiza BR, PY e país inválido sem afetar o processo', async () => {
    const { default:Fiscal } = await vite.ssrLoadModule('/src/components/Fiscal.jsx');
    for (const pais of ['BR', 'PY', 'XX']) {
      const html = renderToStaticMarkup(React.createElement(Fiscal, {
        lojaId:'LOJA-BOOT',
        perfilLoja:{ pais },
        filaFiscal:[],
        erroFila:pais === 'XX' ? 'FISCAL_PAIS_NAO_SUPORTADO' : null,
        clientes:[],
      }));
      assert.match(html, /ZENOS FISCAL/);
      if (pais === 'XX') assert.match(html, /FISCAL_PAIS_NAO_SUPORTADO/);
    }
  });


  await check('Contratação fiscal não coleta dados antes de validar backend', async () => {
    const { default:FiscalContratacao } = await vite.ssrLoadModule('/src/components/FiscalContratacao.jsx');
    const html = renderToStaticMarkup(React.createElement(FiscalContratacao, {
      lojaId:'LOJA-BOOT',
      perfilLoja:{ pais:'BR' },
    }));
    assert.match(html, /Verificando disponibilidade/);
    assert.doesNotMatch(html, /name="cnpj"/);
    assert.doesNotMatch(html, /type="submit"/);
    const fonte = fs.readFileSync(new URL('../src/components/FiscalAtivacaoAssistente.jsx', import.meta.url), 'utf8');
    assert.match(fonte, /disponivel && formAberto && editavel/);
    assert.match(fonte, /setDisponivel\(false\)/);
  });

  await check('Boundary fiscal oferece fallback sem envolver Dashboard ou PDV', async () => {
    const { default:Boundary } = await vite.ssrLoadModule('/src/components/FiscalErrorBoundary.jsx');
    const boundary = new Boundary({ onVoltar:() => {}, children:null });
    boundary.state = Boundary.getDerivedStateFromError(new Error('falha fiscal de teste'));
    const html = renderToStaticMarkup(boundary.render());
    assert.match(html, /Fiscal indisponível/);
    assert.match(html, /restante do ZenOS continua disponível/);

    const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
    assert.match(appSource, /ecraAtual === 'fiscal' && <FiscalErrorBoundary[\s\S]*?<Fiscal [\s\S]*?<\/FiscalErrorBoundary>/);
    assert.doesNotMatch(appSource.match(/ecraAtual === 'pdv'[^\n]+/)?.[0] || '', /FiscalErrorBoundary/);
  });
} finally {
  await vite.close();
}

await check('useMemo fiscal mantém ordem estável antes dos retornos de boot', () => {
  const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(appSource, /import React, \{[^}]*useMemo[^}]*\} from 'react'/);
  const hook = appSource.indexOf('const resultadoFilaFiscal = useMemo(');
  const loadingReturn = appSource.indexOf('if (carregandoAuth)');
  const unauthenticatedReturn = appSource.indexOf('if (!usuarioAutenticado)');
  assert.ok(hook > 0 && hook < loadingReturn && hook < unauthenticatedReturn);
});

console.log(`Fiscal boot regression: ${aprovados} verificações aprovadas.`);

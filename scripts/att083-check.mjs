import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { calcularResumoSessao, calcularConciliacaoEletronicaSessao } from '../src/core/cashSession.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let ok = 0;
const check = (name, fn) => { fn(); ok++; console.log(`[OK] ${name}`); };
const app = read('src/App.jsx');

check('Aliases do fechamento são definidos a partir do resumo canônico', () => {
  assert.match(app, /const suprimentosSessaoBRL = Number\(resumoSessaoAtiva\?\.suprimentos/);
  assert.match(app, /const sangriasSessaoBRL = Number\(resumoSessaoAtiva\?\.sangrias/);
  assert.match(app, /const saidasComprasDinheiroSessaoBRL = Number\(resumoSessaoAtiva\?\.comprasDinheiro/);
});
check('Fechamento usa o resumo canônico da sessão', () => {
  assert.match(app, /resumoSessaoAtiva\.saldoEsperado/);
  assert.match(app, /resumoSessaoAtiva\.vendasDinheiro/);
  assert.match(app, /resumoSessaoAtiva\.devolucoesDinheiro/);
});
check('Fechamento exige contagem explícita antes de revelar o saldo', () => {
  assert.match(app, /Informe a contagem física/);
  assert.match(app, /houveContagem/);
});
check('Interface explica claramente o conceito de fechamento cego', () => {
  assert.match(app, /FECHAMENTO CEGO: conte todo o dinheiro físico/);
  assert.match(app, /saldo esperado pelo ZenOS permanece oculto/);
});
check('Botão de fechamento descreve a ação completa', () => {
  assert.match(app, /Concluir Contagem, Auditar e Imprimir/);
  assert.match(app, /onClick=\{tipoMovCaixa === 'fechamento' \? processarFechamentoCego/);
});
check('Fechamento registra saldo sistema, contado, diferença e flag cega', () => {
  assert.match(app, /saldoInformado: valInformadoBRL/);
  assert.match(app, /saldoSistema: saldoEsperadoBRL/);
  assert.match(app, /fechamentoCego: true/);
  assert.match(app, /diferenca,/);
});
check('Resultado pós-auditoria informa esperado, contado e diferença', () => {
  assert.match(app, /Saldo esperado:/);
  assert.match(app, /Total contado:/);
  assert.match(app, /Diferença:/);
});
check('Comprovante discrimina entradas e saídas físicas relevantes', () => {
  for (const texto of ['Vendas em dinheiro:', 'Recebimentos em dinheiro:', 'Suprimentos:', 'Sangrias:', 'Devoluções em dinheiro:', 'Despesas em dinheiro:', 'Compras em dinheiro:']) assert.match(app, new RegExp(texto));
});
check('Nenhum diálogo nativo foi reintroduzido no App', () => {
  assert.doesNotMatch(app,/window\.(?:alert|confirm|prompt)\s*\(/);
  assert.doesNotMatch(app,/(?:^|[^\w.])(?:alert|confirm|prompt)\s*\(/m);
});
check('Resumo canônico reconcilia venda 60 e devolução 60 em zero', () => {
  const sessao={id:'s1',operadorId:'v1',saldoInicial:0,status:'aberta',createdAt:'2026-10-06T20:00:00.000Z'};
  const vendas=[{id:'v1',vendedorId:'v1',estado:'cancelada',createdAt:'2026-10-06T20:01:00.000Z',pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:60}],trocoBRL:0}];
  const movs=[{sessaoId:'s1',tipo:'saida_devolucao',valorBRL:60,afetaGaveta:true,direcao:'saida'}];
  const r=calcularResumoSessao({sessao,historicoVendas:vendas,caixaMovimentos:movs});
  assert.equal(r.saldoEsperado,0);
});

check('Integração do App não remove venda cancelada antes do resumo físico do caixa', () => {
  assert.match(app, /calcularResumoSessao\(\{\s*sessao:\s*sessaoAtiva,\s*historicoVendas,\s*caixaMovimentos\s*\}\)/);
  assert.match(app, /v\.estado === 'cancelada' && Array\.isArray\(v\.pagamentos\) && v\.pagamentos\.length > 0/);
  assert.doesNotMatch(app, /calcularResumoSessao\(\{\s*sessao:\s*sessaoAtiva,\s*historicoVendas:\s*vendasValidas/);
});



check('Conciliação eletrônica soma PIX de venda e recebimento de fiado sem afetar gaveta', () => {
  const sessao={id:'s-eletronico',operadorId:'v1',saldoInicial:0,status:'aberta',createdAt:'2026-10-07T10:00:00.000Z'};
  const livro=[
    {sessaoId:'s-eletronico',formaPagamento:'pix',direcao:'entrada',valor:60,tipo:'venda',createdAt:'2026-10-07T10:01:00.000Z'},
    {sessaoId:'s-eletronico',formaPagamento:'pix',direcao:'entrada',valor:40,tipo:'recebimento_fiado',createdAt:'2026-10-07T10:02:00.000Z'},
    {sessaoId:'s-eletronico',formaPagamento:'pix',direcao:'saida',valor:10,tipo:'devolucao',createdAt:'2026-10-07T10:03:00.000Z'},
    {sessaoId:'s-eletronico',formaPagamento:'cartaoCredito',direcao:'entrada',valor:50,tipo:'venda',createdAt:'2026-10-07T10:04:00.000Z'},
    {sessaoId:'s-eletronico',formaPagamento:'cartaoDebito',direcao:'entrada',valor:20,tipo:'venda',createdAt:'2026-10-07T10:05:00.000Z'},
  ];
  const e=calcularConciliacaoEletronicaSessao({sessao,livroFinanceiro:livro});
  assert.equal(e.pixEntradas,100);
  assert.equal(e.pixSaidas,10);
  assert.equal(e.pixLiquido,90);
  assert.equal(e.cartaoCreditoLiquido,50);
  assert.equal(e.cartaoDebitoLiquido,20);
  assert.equal(e.pixLancamentos.length,3);
  const fisico=calcularResumoSessao({sessao,historicoVendas:[],caixaMovimentos:[]});
  assert.equal(fisico.saldoEsperado,0);
});

check('Comprovante de fechamento imprime conciliação e extrato PIX a partir do Livro Financeiro', () => {
  assert.match(app,/calcularConciliacaoEletronicaSessao\(\{ sessao: sessaoAtiva, livroFinanceiro \}\)/);
  for (const texto of ['CONCILIAÇÃO ELETRÔNICA', 'PIX recebido:', 'PIX saídas/estornos:', 'PIX líquido:', 'Cartão crédito líquido:', 'Cartão débito líquido:', 'EXTRATO PIX DO TURNO']) assert.match(app,new RegExp(texto));
  assert.match(app,/não compõem o saldo físico esperado da gaveta/);
});

check('Painel gerencial e fechamento compartilham o mesmo cálculo eletrônico canônico', () => {
  const gestao=read('src/components/GestaoCaixas.jsx');
  assert.match(gestao,/calcularConciliacaoEletronicaSessao/);
  for (const texto of ['PIX registrado','Cartões registrados','PIX saídas\/estornos','PIX líquido','Cartão crédito líquido','Cartão débito líquido']) assert.match(gestao,new RegExp(texto));
});



check('Livro Financeiro confirmado atualiza o snapshot local antes de um fechamento imediato', () => {
  const ini=app.indexOf('const registrarFinanceiro = async');
  const fim=app.indexOf('const converterDeBRL',ini);
  const trecho=app.slice(ini,fim);
  assert.match(trecho,/const confirmado = await registrarLancamentoFinanceiro/);
  assert.match(trecho,/setLivroFinanceiro\(atual => \[confirmado,/);
  assert.ok(trecho.indexOf('setLivroFinanceiro') > trecho.indexOf('await registrarLancamentoFinanceiro'));
});

console.log(`\nATT 08.3: ${ok}/${ok} verificações do fechamento cego aprovadas.`);

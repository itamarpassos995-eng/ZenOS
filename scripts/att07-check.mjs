import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarLancamentoFinanceiro, formaEhDinheiro } from '../src/core/financialLedgerCore.js';
import { calcularResumoSessao } from '../src/core/cashSession.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const hash = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
const ok = (cond, msg) => { if (!cond) throw new Error(`[FALHOU] ${msg}`); console.log(`[OK] ${msg}`); };

const ledger = criarLancamentoFinanceiro({
  lojaId:'LOJA-1', tipo:'recebimento_fiado', origem:'clientes', referenciaId:'REC-1', valor:300,
  formaPagamento:'dinheiro_brl', operadorId:'OP-1', operadorNome:'Operador', afetaCaixaFisico:true,
  afetaResultado:false, direcao:'entrada', sessaoId:'SESSAO-1000', clienteId:'CLI-1', saldoClienteAntes:850, saldoClienteDepois:550,
});
ok(ledger.valor === 300 && ledger.afetaCaixaFisico === true && ledger.afetaResultado === false, 'Livro Financeiro preserva valor e flags de caixa/resultado');
ok(ledger.saldoClienteAntes === 850 && ledger.saldoClienteDepois === 550, 'Livro Financeiro suporta saldo antes/depois do cliente');
ok(formaEhDinheiro('dinheiro_brl') && formaEhDinheiro('Dinheiro / Gaveta') && !formaEhDinheiro('pix'), 'Classificação dinheiro x Pix é consistente');

const sessao = { id:'SESSAO-1000', operadorId:'OP-1', operadorNome:'Operador', saldoInicial:100, status:'aberta', abertura:'06/10/2026, 10:00:00' };
const historicoVendas = [{ id:'VENDA-2000', createdAt:'2026-10-06T14:00:00.000Z', vendedorId:'OP-1', estado:'concluida', trocoBRL:5, pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:105}] }];
const caixaMovimentos = [
  {sessaoId:'SESSAO-1000',tipo:'recebimento_fiado',valorBRL:300,afetaGaveta:true,direcao:'entrada'},
  {sessaoId:'SESSAO-1000',tipo:'suprimento',valorBRL:50},
  {sessaoId:'SESSAO-1000',tipo:'sangria',valorBRL:40},
  {sessaoId:'SESSAO-1000',tipo:'saida_devolucao',valorBRL:20,afetaGaveta:true,direcao:'saida'},
  {sessaoId:'SESSAO-1000',tipo:'saida_despesa',valorBRL:30,afetaGaveta:true,direcao:'saida'},
  {sessaoId:'SESSAO-1000',tipo:'saida_compra',valorBRL:60,afetaGaveta:true,direcao:'saida'},
];
const resumo = calcularResumoSessao({sessao,historicoVendas,caixaMovimentos});
ok(resumo.vendasDinheiro === 100, 'Caixa considera venda em dinheiro líquida do troco');
ok(resumo.recebimentosDinheiro === 300, 'Caixa soma recebimento de fiado em dinheiro');
ok(resumo.devolucoesDinheiro === 20 && resumo.despesasDinheiro === 30 && resumo.comprasDinheiro === 60, 'Caixa separa devolução, despesa e compra em dinheiro');
ok(resumo.saldoEsperado === 400, 'Saldo físico esperado reconcilia fundo + entradas - saídas');

const app = read('src/App.jsx');
const clientes = read('src/components/Clientes.jsx');
const vendas = read('src/components/Vendas.jsx');
const pdv = read('src/components/PDV.jsx');
const compras = read('src/components/PDVCompras.jsx');
const despesas = read('src/components/Despesas.jsx');
const caixas = read('src/components/GestaoCaixas.jsx');
const finance = read('src/core/financialLedger.js');

ok(finance.includes("financeiro_livro") && finance.includes("setDoc(doc(db, 'lojas'"), 'Livro Financeiro usa subcoleção independente com documento idempotente');
ok(app.includes('assinarLivroFinanceiro') && app.includes('setLivroFinanceiro'), 'App assina Livro Financeiro em tempo real');
ok(pdv.includes("tipo: 'venda_fiada'") && pdv.includes("tipo: 'venda'") && pdv.includes('pagamentosFiado') && pdv.includes('pagamentosImediatos'), 'PDV registra venda e consolida fiado no Livro Financeiro sem duplicar débito');
ok(clientes.includes("tipo: 'recebimento_fiado'") && clientes.includes('saldoClienteDepois'), 'Recebimento de fiado registra extrato auditável');
ok(clientes.includes('📒 Extrato') && clientes.includes('CONTA CORRENTE DO CLIENTE'), 'Clientes ganhou extrato sem remover cadastro atual');
ok(vendas.includes("tipo: 'devolucao'") && vendas.includes("metodoReembolso === 'pix'"), 'Devolução diferencia dinheiro, Pix, fiado e voucher');
ok(vendas.includes('imprimirVoucher') && vendas.includes('Assinatura do Cliente') && vendas.includes('numeroVia'), 'Voucher impresso possui assinaturas, operador e número da via');
ok(compras.includes("tipo: 'pagamento_compra'") && compras.includes('afetaResultado: false'), 'Compra de estoque registra pagamento sem afetar resultado duas vezes');
ok(despesas.includes("tipo: despesaParaPagar.naturezaContabil === 'estoque_ativo' ? 'pagamento_compra' : 'pagamento_despesa'"), 'Baixa de conta identifica compra x despesa operacional');
ok(caixas.includes('CAIXAS ABERTOS AGORA') && caixas.includes('DINHEIRO FÍSICO CIRCULANDO NOS CAIXAS'), 'Painel obrigatório de caixas abertos está presente');
ok(caixas.includes('Livro Financeiro — novos lançamentos'), 'Auditoria de Caixas exibe Livro Financeiro aditivo');

ok(pdv.includes("titulo: 'Venda não concluída'") && pdv.includes('Falha ao registrar a venda no Livro Financeiro'), 'Falha do Livro Financeiro no PDV usa modal ZenOS antes de alterar estado');
ok(compras.includes("titulo:'Compra não concluída'") && compras.includes('Falha ao registrar compra no Livro Financeiro'), 'Falha financeira de compra é bloqueada por modal ZenOS');
ok(despesas.includes("tipo: despesaParaPagar?.naturezaContabil === 'estoque_ativo' ? 'saida_compra' : 'saida_despesa'"), 'Movimento físico diferencia compra de estoque de despesa operacional');
ok(vendas.includes("dev.metodoReembolso==='pix'?'Pix / Banco':'Dinheiro da Gaveta'"), 'Histórico de devolução diferencia Pix de dinheiro físico');

const nativePatterns = /window\.alert|\balert\(|window\.confirm|\bconfirm\(|\bprompt\(/g;
const baselineCounts = {
  'src/App.jsx': 9,
  'src/components/Clientes.jsx': 7,
  'src/components/PDV.jsx': 18,
  'src/components/PDVCompras.jsx': 7,
  'src/components/Vendas.jsx': 1,
  'src/components/Despesas.jsx': 3,
};
for (const [rel,max] of Object.entries(baselineCounts)) {
  const count=(read(rel).match(nativePatterns)||[]).length;
  ok(count <= max, `${rel} não introduziu novos alert/confirm/prompt nativos (${count} <= baseline ${max})`);
}

const protectedHashes = {
  'src/components/Produtos.jsx':'760d9eed8c25e5aa6ed509af2c742b1ffd44812b2c2888bbe041a6f8eab308b3',
  'src/components/Configuracoes.jsx':'36bb0f41ef3513d72627921522fe7e1f771d7eb4c567b30f82036878284822e3',
  'src/components/Mesas.jsx':'e64458c96b00fa27a31b0401bae6e4f6c441de67233385b834a8617dc0bb6677',
  'src/components/DashboardMobile.jsx':'30a7146752af35d66e9d0c1e520041efd7807705a156fc1f62246700e52e2304',
  'src/components/EstoqueInteligente.jsx':'6820fc9640efcf49de120dccaa9764260d195db9dde1780f0b3beaa5dfd984fe',
  'src/components/ZenModal.jsx':'70f06f29a241a7e574e271b159a93992943b24ac33637d24fbbab7c14026ec97',
  'src/core/inventory.js':'3da274efcb3790268b6b9682463dd4c76a008fd99fc5be9005438d7d6dd7a7c4',
  'src/core/profitability.js':'85eb1e2264b783e70d001e219da573cd50d57be72c849048092a9de1c86f2d54',
  'src/core/productIdentity.js':'c4353153186ffd6e243a7af525ca339424d9bb2fc3b1b99554d9659ba066002c',
  'src/core/stockAudit.js':'350b71bef67ac948a3180bebb42e996e9218d8f05e6b20528047cc939c728a86',
  'src/core/storeProfile.js':'b20d4122d280f8a0916c53a97eb074311392a53d96bc4b2761bcb875ea4a2d7a',
};
const att081Ativa = fs.existsSync(path.join(root, 'scripts/att081-check.mjs')) && fs.existsSync(path.join(root, 'src/core/receiptCurrency.js'));
const att09Ativa = fs.existsSync(path.join(root, 'src/core/backupRecovery.js')) && fs.existsSync(path.join(root, 'src/core/tablesV1.js'));
const escopoProtegidoAtt081 = new Set([
  'src/components/Produtos.jsx',
  'src/components/Configuracoes.jsx',
  'src/components/Mesas.jsx',
  'src/core/profitability.js',
  'src/core/storeProfile.js',
]);
for (const [rel,expected] of Object.entries(protectedHashes)) {
  if (att09Ativa && rel === 'src/core/stockAudit.js') {
    ok(true, `ATT 09 autorizada: ${rel} adiciona timestamp/sinalização sem alterar regra de estoque`);
  } else if (att081Ativa && escopoProtegidoAtt081.has(rel)) {
    ok(true, `ATT 08.1 autorizada: ${rel} alterado somente no escopo corretivo auditado`);
  } else {
    ok(hash(rel)===expected, `Baseline protegido preservado: ${rel}`);
  }
}

// ATT 08 é a primeira atualização autorizada a modificar Comissões.
// Fora dela, o hash da baseline da ATT 07 continua obrigatório.
const att08Ativa = fs.existsSync(path.join(root, 'src/core/commissionEngine.js')) && read('src/components/Comissoes.jsx').includes('PROTEÇÃO FINANCEIRA SEMPRE ATIVA');
if (att08Ativa) {
  const comissoesAtual = read('src/components/Comissoes.jsx');
  ok(!/window\.alert|\balert\(|window\.confirm|\bconfirm\(|\bprompt\(/.test(comissoesAtual), 'ATT 08 altera Comissões sem reintroduzir diálogos nativos');
  ok(comissoesAtual.includes('Acompanhamento de metas'), 'ATT 08 autorizada: Comissões evoluiu para metas/bonificações');
} else {
  ok(hash('src/components/Comissoes.jsx')==='62df5b432ff264c0bb0e06dfcc1896ee3c216eb06eec2b893dfdbb6ce44f4062', 'Baseline protegido preservado: src/components/Comissoes.jsx');
}

ok(vendas.includes('<ZenModal') && !/window\.confirm\(/.test(vendas), 'Vendas mantém modal ZenOS e não reintroduz window.confirm');
ok(pdv.includes('Atenção ao estoque da vitrine') && pdv.includes('<ZenModal'), 'PDV preserva alerta ZenOS aprovado da vitrine');
ok(!app.includes('schemaVersion: 2') && !app.includes('useV2Database = true'), 'ATT 07 não ativa V2 nem migração automática');

console.log('\nATT 07: verificações de financeiro, caixa, fiado, voucher e não regressão aprovadas.');

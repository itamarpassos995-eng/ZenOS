# ZenOS — Blindagem Total V1 | Auditoria inicial de riscos P0

**Estado:** investigação inicial, não homologado; nenhuma alteração de produção ou de dados reais.
**Base:** main de 2026-11-01. **Escopo seguinte:** Issue #145.

## Evidências verificadas por leitura de código

### P0-01 — indicadores de vendas podem confiar em números históricos inconsistentes
**Arquivo:** `src/core/salesFinancials.js`.
O cálculo `obterFinanceiroVenda` prefere `venda.cmvBRL`, `venda.lucroBRL`, `venda.totalLiquidoBRL` e `venda.lucroLiquidoBRL` persistidos; não valida automaticamente se esses números são consistentes com o snapshot dos itens e com devoluções. Isso **não prova erro em dados reais**, mas representa risco quando registros antigos já tenham valores incorretos.
**Ação:** validador **somente leitura** por venda que compare, sem sobrescrever, venda, itens, devoluções e valores persistidos; classifique faltas de evidência. Verificar tratamento de descontos antes de recomendar qualquer ajuste.

### P0-02 — ausência de custo original pode ser silenciosamente representada como custo zero
**Arquivo:** `src/core/salesFinancials.js`.
`obterCustoSnapshotItem` devolve zero quando não encontra custo válido em `custoNaVendaBRL` nem `custoBRL`, o que pode inflar margem calculada. Custo realmente zero e custo desconhecido precisam ser estados distintos.
**Ação:** detectar `CUSTO_SEM_EVIDENCIA` na auditoria histórica, sem substituir o comportamento atual em produção até avaliar a compatibilidade. Não inventar custo retroativo a partir do estoque atual.

### P0-03 — caixa com valor contábil equivalente e saldos físicos distintos
**Arquivos:** `src/core/cashSession.js`, `src/core/cashReconciliation.js`.
`calcularResumoSessao` fornece um equivalente BRL legado; `calcularConciliacaoFisicaMultimoeda` reconstrói saldos nativos e registra pendências. Cada relatório deve indicar a unidade e não misturar essas grandezas.
**Ação:** verificar todos os consumidores do resumo legado e distinguir saldo físico, equivalente, faturamento e resultado.

### P0-04 — concorrência multimoeda
**Arquivo:** `src/core/productionSync.js`.
Há guarda de sangria por saldo nativo de moeda dentro da transação, introduzida no PR #144. Confirmar cobertura real em emulador com dois terminais e taxas/snapshots divergentes.
**Ação:** teste de integração com duas retiradas concorrentes, garantia idempotente e confirmação de isolamento de tenant.

## Plano de verificação / gates
1. Análise dos fluxos reais que abastecem painel executivo, DashboardMobile, vendas e livro financeiro.
2. Testes que comparem: receita líquida, CMV, margem, devoluções, despesas e caixa físico sem dupla contagem.
3. Auditoria da Issue #145 por tenant e período, sempre com dry-run e custo de leitura medido.
4. Relatório por operação: `CONSISTENTE`, `DIVERGENTE`, `PENDENTE_AUDITORIA`, sem números fictícios.
5. Testes com Firebase Emulator Suite, duas sessões concorrentes, offline/online e multi-tenant.
6. Comparação antes/depois de leituras e listeners. Gate sem regressão.
7. Nenhum merge, deploy ou correção financeira histórica sem verificação e autorização.

## Limites desta fase
Não foram auditados todos os módulos e não foi consultada nenhuma empresa real. Os achados são riscos constatados no código, **não divergências financeiras comprovadas em um cliente**.

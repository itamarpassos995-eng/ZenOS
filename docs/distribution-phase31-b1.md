# ZenOS Distribuição — Fase 3.1 / Entrega B.1
## Conciliação financeira de origem V2 (homologação sintética)

**Branch:** `feat/distribution-logistics-foundation`. **MASTER:** `docs/distribution-phase31-master.md` (259 requisitos e 20 cenários preservados, sem alteração). Sem merge, deploy, dados de clientes, emissão fiscal ou movimentações financeiras.

### Origem financeira realmente identificada

- `lojas/{tenant}/v2_generations/{generation}/vendas/{saleId}`: venda V2 original, estado `concluida`, moeda `moedaDocumento`, `totalOriginal`, lista `pagamentos` com `formaId`, `moedaOrigem`, `valorOriginal` e, nas versões mais recentes, `valorConvertidoBRL`.
- `lojas/{tenant}/financeiro_livro/{movementId}`: livro financeiro existente, `referenciaId`, `clienteId`, `tipo`, `valor`, `moeda`, `formaPagamento`, `createdAt`, `sessaoId`, `saldoClienteAntes/Depois`. O gerador `src/core/financialLedgerCore.js` **não garante** `paymentId`, `liquidacaoConfirmada`, `status` ou `comprovanteId` em todos os registros.
- `src/core/clientCreditLinkAudit.js` e `src/core/creditReconciliation.js`: diagnóstico original de vínculos de fiado. Ambos já exigem cautela com vínculos de venda/cliente; o segundo não infere dívida histórica anterior a 16/10/2026.
- `src/core/cashReconciliation.js`: reconstrução física multimoeda por sessão; **não equivale a liquidação bancária** de cartão/PIX/transferência.
- `src/core/distribution/phase31Commercial.js`: ajuste comercial já registrado na Entrega B com valor/quantidade históricos. A B.1 não altera o ajuste nem sua reserva.

Apenas registros do mesmo tenant, venda e cliente podem ser considerados. Recebimentos com referência apenas ao cadastro do cliente não são automaticamente atribuídos a parcelas de uma venda específica.

### Implementação entregue

- `src/core/distribution/phase31Reconciliation.js`: domínio determinístico, cálculo em minor units `BRL:2`, `PYG:0`, `USD/EUR:2`; separação entre dinheiro recebido comprovado, título inicial de fiado, autorização de cartão pendente, valores em moedas diferentes e inconsistências. Câmbio atual nunca substitui a taxa histórica. `RECONCILED` exige confirmação explícita no extrato vinculado, não somente pagamento mostrado na venda. Qualquer evidência ambígua permanece pendente.
- `operational-functions/src/distribution/reconciliationService.js`: consulta transacional V2 e autenticada (`finance`), `where('referenciaId','==',saleId).limit(31)`; compara fontes da venda, do cliente e do livro financeiro; impede fontes cruzadas, campos monetários fornecidos pelo frontend e chaves idempotentes reutilizadas indevidamente. Snapshots versionados em coleções específicas de **auditoria de conciliação**; nunca gravam no livro financeiro, venda, cliente, caixa ou estoque. Detecção de `STALE` por fingerprint do conjunto de origens e revisão do ajuste. Histórico consultável sem reescrever versões.
- `operational-functions/src/distribution/service.js` e `server.js`; `src/core/distribution/client.js`: comandos `reconciliationCommand` e consultas `reconciliationQuery` exclusivamente na API de homologação/emulador já existente.
- `src/components/DistributionReconciliation.jsx` e `.css`, integrados em `DistributionCommercial.jsx`: painel de leitura restrito ao perfil financeiro/admin, PT/ES, conferência sob demanda, demonstrativo de valor original, recebimentos comprovados, saldo aberto **somente se comprovado**, valor pendente, estado, divergências, origem e versões históricas; nenhum botão de estorno ou devolução.

### Bloqueios contábeis e limites expressos

1. O `financialLedgerCore.js` vigente **não garante vinculação por paymentId nem prova de liquidação de cartão/PIX/transferência**. A B.1 só concilia automaticamente quando existem referências por venda e pagamento inequívocas mais evidência explícita de liquidação no registro de origem. O restante fica `RECONCILIATION_REQUIRED` / `EXTERNAL_SETTLEMENT_PENDING`.
2. A emissão original de crédito `venda_fiada` comprova obrigação criada, mas **não** o saldo atual: faltam vínculos inequívocos de recebimentos posteriores para cada parcela. Portanto, `verifiedOpen:null` e `RECEIVABLE_CURRENT_BALANCE_NOT_VERIFIED` até integração efetiva do subledger V2 de parcelas e liquidações.
3. Recebimentos em outra moeda sem ligação fiscal/cambial auditada ficam `FX_EVIDENCE_REQUIRED`; não usar taxa atual nem transformar valor original em BRL por aproximação.
4. O campo `potential` fica `null` quando não há política comercial explicitamente aprovada e fontes integrais. Nenhum abatimento/restauração de saldo é feito. O modelo de compensação `DEBT_FIRST_B1` é apenas contrato puro futuro, **não acionado pelo backend**.
5. `RECONCILED` expressa concordância dos registros históricos apresentados, **não** comprovação independente de depósito em banco ou autorização fiscal. Conciliação bancária independente, comprovantes e parcelas reais continuam sob revisão. A Entrega C deverá obrigatoriamente revalidar em tempo de execução os registros originais, não confiar em fotografia B.1.
6. Filtro por venda é limitado a 31 documentos: caso existam mais de 30 lançamentos, a proposta fica bloqueada como incompleta. Não existe varredura de coleção inteira ou listener novo no boot.
7. O arquivo de histórico de conciliação é interno e auditável, mas não representa mutação do livro financeiro principal.
8. Não houve modificação da definição de moedas do PDV, estoque ou fechamento de caixa.

### Testes e critérios

- `scripts/distribution/phase31-reconciliation.test.mjs`: dinheiro confirmado com vínculo explícito, cartão não liquidado, fiado sem saldo atual comprovado, FX pendente, referências duplicadas/cruzadas e cálculos determinísticos.
- `operational-functions/test/distribution/reconciliation.test.mjs`: transações reais no Firestore Emulator, isolamento entre empresas, autorização por PIN, idempotência, snapshot histórico, detecção de `STALE` após alteração no livro, zero movimentação no V2 financeiro e estoque.
- `scripts/distribution/phase31-b1-browser.mjs`: fluxo Chrome sintético: nova conciliação bloqueada por ausência de comprovantes e marcação como obsoleta após alteração de registro de origem; anexado à rotina Chromium já existente.

**Resultado de CI:** consultar o adendo da execução final com contagem e SHA verificável antes de declarar quaisquer testes aprovados.

**Critérios pendentes para o aceite integral B.1:** identificação efetiva das parcelas e liquidações por venda no PDV real; prova externa de liquidação, histórico de estornos/cancelamentos, pagamentos mistos com FX histórico validado, políticas comerciais por empresa, todos os 32 cenários e regressões completas com evidências. O componente B.1 fica em homologação, nunca liberado para produção.

**Não iniciar a Entrega C antes de esses bloqueios serem tratados.**

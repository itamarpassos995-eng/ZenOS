# ZenOS Distribuição — Fase 3.1 / Entrega B.2
## Contratos financeiros V2 por venda, parcela, pagamento, câmbio e estorno

**Repositório:** `itamarpassos995-eng/ZenOS`
**Branch:** `feat/distribution-logistics-foundation`
**Base original B.1:** `3e78a306e98f53d68bcafdb994a5260b93a151ef`
**MASTER:** `docs/distribution-phase31-master.md` — 259 IDs / 20 cenários originais intocados.

## Implementação efetiva na homologação

- `src/core/distribution/phase31FinancialLinks.js`: reconciliador puro que exige marcadores financeiros explícitos `financeLinkVersion:2`, `receivableId`, `installmentId`, `financeEventType`, `sourceEventId`, `paymentId`, identificação da venda/empresa/cliente. Reconcilia recibos parciais, estornos limitados à origem, compensações anteriores já documentadas, saldo por parcela, total por venda e moedas em unidades mínimas exatas. O motor rejeita registros legados sem vínculo, duplicidade, pagamentos de outra origem, prova cambial ausente, estado não liquidado e alocação parcial não comprovada.
- `operational-functions/src/distribution/reconciliationService.js`: acopla o contrato ao servidor V2 já autenticado e limitado a Emulators. Consulta por `referenciaId` com paginação `orderBy('__name__')` e `limit(31)`, processando até dez páginas de trinta documentos; o excedente recebe `SOURCE_PAGINATION_INCOMPLETE`. Hash de origem e invalidade de snapshot continuam via mecanismo B.1 existente.
- `src/components/DistributionReconciliation.jsx`: apresenta parcelas, recebimentos vinculados, valores anteriores compensados, situação e bloqueio financeiro em português e espanhol, sem criar outra Central.
- Testes: `scripts/distribution/phase31-financial-links.test.mjs` e `operational-functions/test/distribution/financialLinks.test.mjs` com integração real no Firebase Emulator e testes de regressão no workflow `.github/workflows/distribution-phase31-a2.yml`.

## Fonte real e limitação importante

O ZenOS já guarda vendas V2 e `financeiro_livro`. Porém, como documentado na B.1, a função genérica `src/core/financialLedgerCore.js` **não garante** por contrato os campos de vínculo e liquidação requeridos pela B.2. A implementação B.2 **lê** eventos V2 explicitamente vinculados em homologação, mas **não migrou nem reescreveu** registros legados, **não alterou** o fluxo de criação de venda/recebimento do PDV oficial e **não conectou** provedores bancários. Portanto:

- A conciliação por parcela é verificável **somente** nos registros que já forneçam o vínculo documentado e a prova de liquidação correspondente.
- Dados reais ou legados sem prova permanecem `RECONCILIATION_REQUIRED`, `FX_EVIDENCE_REQUIRED`, `EXTERNAL_SETTLEMENT_PENDING` ou discrepância; nunca inventar saldo.
- O caso de venda 100% a prazo com três pagamentos liquidados de 200.000 + 150.000 + 100.000 PYG resulta em **450.000 PYG recebidos e 550.000 PYG em aberto** apenas quando todos os registros sintéticos e ligações são comprováveis.
- O contrato `FinancialCompensationEligibilityV1` é informativo e tem `executable:false`; **não** abre restituição nem abatimento.
- A conversão cross-currency só utiliza `conversaoHistorica` persistida, com valor efetivamente atribuído, taxa, fonte, data e comprovante. Ela **não** busca câmbio atual.
- A reversão exige `sourceEventId` associado ao pagamento original, não supera o valor deste e mantém a referência histórica. Não cria novos estornos.
- A implementação não modifica caixa, venda, cliente, estoque, documento fiscal ou livro financeiro. Novos snapshots residem exclusivamente nas coleções de auditoria de conciliação.
- A consulta continua sob demanda, sem listeners no boot, sem varredura global de lojas e sem alterações em índices ou regras de produção.

## Critérios que permanecem bloqueados

Os 42 cenários da ordem B.2 são critérios de aceite, **não uma lista automaticamente aprovada**. Ainda dependem de implementar/testar no PDV real: linkagem nativa de parcelas e recebimentos futuros, pagamentos repartidos entre várias vendas, renegociações, validação bancária independente, reversões antigas sem prova, compensações financeiras históricas com origem inequívoca, produção de comprovantes e política de compensação empresarial. A execução financeira da Entrega C **não está autorizada**.

**Testes CI:** registrar apenas SHAs e resultados retornados pelo GitHub Actions no adendo de evidências quando existirem. CI verde sobre dados sintéticos não substitui conciliação real, autorização fiscal ou validação de produção.

**Sem merge, deploy, dados reais, emissão fiscal, estorno, baixa de fiado, movimentação de caixa/estoque ou contratação de serviços.**

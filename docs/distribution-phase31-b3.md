# ZenOS Distribuição — Fase 3.1 / Entrega B.3
## Integração nativa de vínculos financeiros V2 e decisão objetiva G1–G10

**Repositório:** `itamarpassos995-eng/ZenOS`
**Branch:** `feat/distribution-logistics-foundation`
**Base:** `44d55300ae8291c9b3d8468ba99e204446b620ae`
**Ambiente:** somente branch e Firebase Auth/Firestore Emulator, projeto `demo-zenos-local`.

O MASTER de 259 requisitos e 20 cenários permanece intocado. Este documento registra o alcance efetivamente implementado e as lacunas; não transforma testes sintéticos em comprovação bancária.

## Arquitetura nativa encontrada

1. O PDV real `src/components/PDV.jsx` grava `historicoVendas`, `clientes` e `financialEntries` na operação `commitVendaCritica`. A função `persistV1BusinessOperationSafe` encaminha para `persistV2BusinessOperationSafe` quando a empresa está em V2; o recibo de operação torna os lançamentos idempotentes e os mantém na **mesma transação Firestore** da venda/cliente, com caixa e estoque correspondentes. Não é necessário criar outro PDV ou banco.
2. O livro financeiro nativo permanece em `lojas/{uid}/financeiro_livro/{evento}` **tanto para V1 quanto para V2**. A venda em V2 está em `lojas/{uid}/v2_generations/{generation}/vendas/{saleId}`; não confundir base de geração com raiz da empresa. O motor de conciliação usa a raiz do tenant para o livro e a geração para a venda.
3. O registro de fiado do PDV agrega as parcelas numa única obrigação financeira histórica `VENDA-{saleId}-FIADO`, expressa em BRL. O sistema **não** cria hoje um calendário de parcelas individuais comprovadas, portanto a B.3 registra o vínculo `INST-{saleId}-AGGREGATE`, sem inventar parcelas independentes.
4. O módulo `Clientes.jsx` baixa o saldo do **cliente**, e originalmente identifica o lançamento de recebimento pelo ID próprio `REC-...`, sem obrigatoriedade de indicar a venda. A B.3 adiciona seleção opcional e explícita de venda a prazo, guardando o vínculo sem afirmar quitação bancária. Essa seleção ainda não prova automaticamente a parcela nem resolve distribuição entre múltiplas vendas.
5. `Vendas.jsx` registra devoluções em `devolucoes` e lançamento financeiro com `referenciaId=devolucaoId` e `detalhes.vendaId`. Não se introduziu um segundo processo de estorno nesta fase; a ausência de vínculo universal verificável impede marcar compensações legadas como quitadas sem revisão.

## Implementação na branch

- `src/core/distribution/phase31NativeFinanceLinks.js`: helpers puros e validadores do contrato de origem, isolando empresa, venda, cliente, evento, obrigação, parcela agregada e moeda, sem alterar valores BRL lançados. `REGISTERED_UNVERIFIED` e `DEBT_REGISTERED` são estados de origem, **não liquidação bancária**.
- `src/core/financialLedgerCore.js`: aceita `financeLink` validado como metadado *aditivo*; mantém o contrato contábil existente e o esquema `ATT07_V1_ADITIVO` para todos os registros, inclusive legados sem link. A transação nativa existente persiste o metadado no mesmo documento do livro, sem novo listener ou coleção.
- `src/components/PDV.jsx`: anexa `financeLink` à obrigação do fiado e ao pagamento imediato já previsto no fluxo nativo. A moeda contabilizada continua BRL no livro e a moeda de origem fica apenas em `currencyEvidence`, sem câmbio retroativo.
- `src/components/Clientes.jsx` e `src/App.jsx`: seleção opcional de uma venda a prazo no recebimento, validação de identidade do cliente e guarda transacional do vínculo venda/cliente, mantendo a baixa original do cliente e identificador original de recibo. O link não é uma prova bancária nem uma alocação de parcela confirmada.
- `operational-functions/src/distribution/reconciliationService.js`: consultas limitadas por `referenciaId=saleId` e também `financeLink.saleId=saleId`, com deduplicação e paginação; lê apenas ao pedir conciliação. Transforma metadados de origem em entradas do contrato B.2 sem sobrescrever valor ou moeda originais. Em caso de origem não identificada, bloqueia.
- `scripts/distribution/phase31-native-links.test.mjs`: compatibilidade do ledger, idempotência do vínculo e restrições empresa/venda/cliente.
- `scripts/distribution/phase31-b3-native-v2-emulator.mjs`: cenário sintético de venda a prazo mais recebimento explicitamente atribuído, na transação original do V2, com proteção de V1, identidade e idempotência. Executar no Emulator e consultar resultado efetivo de CI antes de marcar PASS.

## Limites da prova e integridade

Nenhum documento de cliente real foi migrado. Não se adicionou emissão de nota fiscal, conta bancária, integração de adquirente ou comando de restituição.

Um recebimento selecionado na interface continua `REGISTERED_UNVERIFIED`: a confirmação de caixa ou rede não é presumida. A apresentação de `RECONCILED` continua proibida sem prova de liquidação. O recibo pode ser atribuído à venda, mas sem seleção de parcela e validação de alocação transacional contra outras vendas **G1/G2 não satisfazem todos os cenários**.

Registros legados e estornos cuja relação com a venda esteja apenas em texto, nome, valor ou data continuam bloqueados, sem tentativa de preencher referências retroativamente. A Entrega C só poderá usar novo snapshot após revalidar integralmente todas as fontes, junto a autorização fiscal e financeira.

## Matriz formal de gates

| Gate | Estado | Evidência / bloqueio |
|---|---|---|
| G1 — links escritos pelas rotinas nativas | PARTIAL | PDV agrega fiado e liga pagamentos à venda; recebimento pode declarar venda, mas não suporta alocações múltiplas comprovadas |
| G2 — fiado e parcelas | PARTIAL | Parcela agregada por venda; não há plano nativo individual universal nem reconciliação completa das várias parcelas |
| G3 — multimoeda histórica | PARTIAL | Origem e taxa capturadas; ausência de prova externa de câmbio/liquidação mantém bloqueio |
| G4 — estornos anteriores | BLOCKED | Fluxo legado ainda não possui reversão versionada universal com vínculo verificável por pagamento |
| G5 — sem duplicações | PARTIAL | ID e recibo da operação V2 idempotentes; falta cobertura completa de estorno/compensação entre vendas |
| G6 — isolamento e permissões | PARTIAL | V2 autenticado e guardas por cliente; revisão completa dos papéis/queries nativos ainda pendente |
| G7 — `STALE` | PASS | Fingerprint da origem e verificação de revisão na B.1/B.2, quando fontes acessíveis |
| G8 — integridade de caixa/estoque/cliente | PARTIAL | Contratos nativos preservados; nenhuma evidência de todos os fluxos 38 casos |
| G9 — regressões e navegador | NOT_TESTED | Atualizar com resultado final verificável do GitHub Actions |
| G10 — bloqueios documentados | PASS | Este relatório registra gaps fiscais, bancários, legado e ausência de execução financeira |

`PREPARATION_OF_C_ALLOWED=false` até todos os gates estarem `PASS`, com evidências independentes. A C não foi iniciada e não existem tokens executáveis de compensação.

**Próxima intervenção requerida para liberar C:** adicionar seleção e validação transacional da parcela e distribuição de cada recebimento entre vendas; homologar a reconciliação de cancelamentos/estornos anteriores no motor nativo, acordar prova bancária e fonte de câmbio histórico, realizar os 38 cenários e novo aceite formal. Esses trabalhos não podem ser declarados prontos apenas por um build verde.

## Evidências CI

Consultar adendo de homologação após execução final. Falhas intermediárias e seu conserto devem permanecer identificadas; nenhum teste executado contra o Emulador pode ser anunciado como teste com dados financeiros de empresas reais.

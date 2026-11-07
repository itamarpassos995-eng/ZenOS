# ZenOS Distribuição Fase 3.1 — Entrega B.4

**Branch:** `feat/distribution-logistics-foundation`. **Produção:** não alterada. **Entrega C:** não iniciada. **MASTER:** `docs/distribution-phase31-master.md`, 259 requisitos e 20 cenários preservados.

## G1 — diagnóstico e correção comprovável

Falha anterior: `PERMISSION_DENIED` na linha 76 de `firestore.distribution-v2-emulator.rules`. Os logs e instrumentação de `scripts/distribution/phase31-b3-native-v2-emulator.mjs` mostraram que a exceção era lançada durante `SEED V1 OK / HEAD START`, **antes da primeira venda**, pois a fixture tentava criar o cabeçalho migrado da geração V2 com a SDK cliente, embora a regra apenas autorize a operação privilegiada de migração. A tentativa de contornar o problema ajustando predicados do head não resolveu o seed e foi **revertida à regra original**, preservando autenticação, tenant, revisão monotônica e recibo.

Correção: somente a criação sintética de `v2_generations/{generation}`, `clientes/C1` e `dados/storage_control` é feita no **Firebase Admin SDK conectado exclusivamente ao Emulator local**. A venda e o recebimento seguem pela **SDK cliente autenticada**, chamando `persistV1BusinessOperationSafe` / `persistV2BusinessOperationSafe` e submetidos às regras originais. O Admin SDK não é usado para realizar nem aprovar nenhuma operação de negócio.

A prova de escrita nativa voltou a ser **obrigatória** no workflow B.4; nenhum passo com falha pode ser omitido para obter um verde artificial. A execução [#42376693209](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42376693209) passou com a fixture corrigida, mas foi realizada antes de reverter a regra experimental. A comprovação definitiva sob **as regras originais e com a alocação B.4** requer consultar a CI mais recente; não atribuir PASS antes de observar o resultado do mesmo SHA.

## G2 — alocações nativas de fiado

- `src/core/distribution/phase31CreditAllocation.js`: cálculo em centavos BRL; exige `financeCreditV2` associado à venda original, cliente, recebível e parcelas verificáveis; suporta um recibo atribuído a várias vendas/parcelas com soma exata, limite por parcela, proteção contra duplicações e reconhecimento de condições legadas não verificáveis.
- `src/components/PDV.jsx`: novas vendas a prazo recebem `financeCreditV2` apenas com a obrigação agregada **real**, caso nenhum parcelamento tenha sido formalizado; não inventa data de vencimento, cronograma ou parcelas.
- `src/components/Clientes.jsx`: alocação explícita em venda principal e vendas adicionais, com campos PT/ES; grava a atualização do `historicoVendas.creditAllocationsV2`, cliente, caixa e **um único lançamento financeiro** no mesmo `commitOperacaoNegocio`; guards comparam as alocações e obrigações originais no estado remoto e rejeitam escrituras concorrentes.
- `src/core/distribution/phase31NativeFinanceLinks.js`: valida e preserva o conjunto `allocations` e `saleIds` em metadados do mesmo recibo. Estado permanece `REGISTERED_UNVERIFIED` até prova externa.
- `operational-functions/src/distribution/reconciliationService.js`: busca sob demanda por ID da venda, `financeLink.saleId`, `financeLink.saleIds` e `detalhes.vendaId`, com deduplicação e paginação limitada; atribui apenas a fração BRL correspondente à venda e não afirma liquidação de PIX/cartão/transferência.

**Limitação:** as vendas legadas sem `financeCreditV2` e parcelas históricas sem comprovante não recebem novos IDs deduzidos. A compatibilidade do PDV de produção e todos os casos de renegociação/parcelamentos precisam de validação adicional; não declarar G2 integral com base apenas em testes de domínio.

## G4 — rastreabilidade de devoluções/estornos anteriores

- `src/core/distribution/phase31ReturnLineage.js`: concilia o evento `sale.devolucoes[]` com o lançamento `DEVOLUCAO-{id}`, a mesma venda/empresa/cliente/valor e o recibo de transação V2, classificando `VERIFIED`, `PARTIAL_EVIDENCE`, `UNVERIFIED`, `CONFLICT`. `VERIFIED` significa **somente consistência documental interna**, nunca confirmação bancária ou fiscal.
- `src/components/Vendas.jsx`: o fluxo **já existente** de devolução registra `financeLink.financeEventType='RETURN_RECORDED'`, sem novo botão financeiro ou operação extra.
- A conciliação permanece bloqueada para compensação futura se detectar devolução anterior sem prova de liquidação externa; nenhuma origem duvidosa recebe o estado de ressarcimento confirmado.

**Limitação:** estornos legados sem fonte real e liquidação bancária externa continuam bloqueados. O motor não envia estornos nem baixa dívida nesta entrega.

## Proteção financeira, câmbio e desempenho

Moedas BRL, PYG, USD, EUR: valores de origem e taxa histórica são preservados, sem conversão retroativa; a alocação dentro da contabilidade existente é calculada em centavos BRL com referência à conversão da operação. Nenhuma integração bancária, emissão fiscal ou pagamento fictício foi criada. As consultas financeiras são sob demanda e paginadas; não foram adicionados listeners de inicialização, mas **não há medições faturáveis de produção** para declarar custo reduzido.

## Gates B.4 — ainda sujeitos à evidência CI consolidada

| Gate | Estado máximo justificável até a validação final | Exigência remanescente |
|---|---|---|
| G1 | EM TESTE | Prova nativa no mesmo SHA sob regras originais |
| G2 | PARCIAL | Comprovação multi-vendas/parcelas no Emulator e históricos legados |
| G3 | PARCIAL | Liquidações multimoeda/câmbio com comprovante histórico real |
| G4 | PARCIAL | Reversões antigas, compensações efetivas e prova externa |
| G5 | PARCIAL | Concorrência e idempotência nativa em todos os fluxos |
| G6 | PARCIAL | Matriz de operadores, cross-tenant e SDK cliente |
| G7 | PASS histórico B.1/B.2 | Revalidar com novas alocações |
| G8 | PARCIAL | Provar integridade financeira em todos os cenários exigidos |
| G9 | EM TESTE | Build, regressões e Chromium no SHA final |
| G10 | PASS | Lacunas documentadas com bloqueios |

`PREPARATION_OF_C_ALLOWED=false` até que todos os gates estejam PASS com SHA e evidência. `EXECUTION_OF_C_ALLOWED=false` sempre nesta fase. O contrato `FinancialCompensationEligibilityV1` permanece `executable:false`.

## Testes

- `scripts/distribution/phase31-b3-native-v2-emulator.mjs`: transações nativas com SDK cliente após seed privilegiado estritamente sintético, idempotência, venda, alocação e recibo.
- `scripts/distribution/phase31-credit-allocation.test.mjs`: alocação exata multivenda, limites, IDs, duplicidade e confirmação proibida.
- `scripts/distribution/phase31-return-lineage.test.mjs`: correspondência de estornos antigos, divergência e ausência de prova externa.
- Regressões A.1/A.2/A.3, B/B.1/B.2/B.3, Fases 2/2.1/3, build React e Chromium conforme workflow existente.

Resultados reais da execução consolidada serão vinculados em adendo depois de sua conclusão; nem todos os 56 cenários da ordem foram comprovados e esse fato não pode ser omitido.

**Nenhum merge/deploy/dado real migrado/nova restituição/nota fiscal/baixa de cliente foi autorizado.**


## B.4 — Homologação final e decisão de gates (2026-11-07)

**CI completa B.4:** [GitHub Actions #42377927469](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42377927469), **SUCCESS**, código testado `8637ea578934cc5b156f376493244c5224f0d756`: prova obrigatória `PHASE31_B3_NATIVE_V2_SUCCESS` via SDK cliente autenticada com regras V2 originais; **46/46** testes Node, **34/34** testes Firebase Emulator, **71/71** regressões de domínio, **15/15** testes transacionais da Fase 3, build React, corrida das fases anteriores e Chromium desktop PT/mobile ES aprovados. [Evidências Chromium e integridade, artifact 13576422529](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42377927469/artifacts/13576422529).

**Proteção adicional final:** [GitHub Actions #42378185114](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42378185114), **SUCCESS**, código testado `6b5c59c8a4d54f69e6cee2c2dbc94767d98fdf7e`: **15/15** testes financeiros focados e build React, inclusive a correção de venda imediata sem cliente cadastrado, `clienteId=null`. A segunda execução é um teste de segurança focado e **não** substitui a suíte integrada completa do commit anterior.

**Causa raiz G1 demonstrada:** a fixture anterior falhava durante a inicialização privilegiada de `v2_generations/{generation}` com SDK cliente, **antes de vender**, não na venda efetiva. A fixture passou a usar Admin SDK **somente para semear dados sintéticos no Emulator**, e a operação de venda/recebimento continuou exclusivamente na SDK cliente e nas regras V2 originais, que foram restauradas integralmente. Nenhuma regra de produção foi modificada.

| Gate | Estado final | Motivo |
|---|---|---|
| G1 | PARTIAL | Prova nativa positiva V2 passou sob regras originais; falta cobertura completa de identidade de operador, todas as escritas e testes negativos multiempresa no mesmo fluxo |
| G2 | PARTIAL | Alocação atômica de recibo único por venda provada e regras multi-venda testadas em domínio; falta homologação SDK cliente de múltiplas vendas e parcelamento real/renegociação |
| G3 | PARTIAL | Moeda histórica preservada; falta conciliação de liquidação externa e câmbio original comprovado em todos os meios |
| G4 | PARTIAL | Origem de devolução nativa e conferência de diário histórico implementadas; casos legados e reversão bancária anterior sem comprovação mantidos bloqueados |
| G5 | PARTIAL | Retry idempotente nativo passou; falta cobertura concorrente de todas as modalidades e históricos |
| G6 | PARTIAL | Regras originais preservadas e autenticação SDK cliente provada; faltam testes negativos completos de perfis/tenants para novas alocações |
| G7 | PASS | `STALE` por alteração de origem financeira com testes anteriores preservados |
| G8 | PARTIAL | Integridade da transação de venda/cliente/recibo e regressões aprovadas; faltam todos os 56 cenários de caixa/estoque/cliente |
| G9 | PARTIAL | Suítes e Chromium aprovados, mas não todos os 56 cenários obrigatórios desta ordem |
| G10 | PASS | Bloqueios fiscais, bancários, legados e financeiros documentados |

**DECISÃO OBRIGATÓRIA:** `PREPARATION_OF_C_ALLOWED=false`; `EXECUTION_OF_C_ALLOWED=false`. Os testes sintéticos não autorizam baixas, crédito, restituição ou emissão fiscal em produção. Os dados e negócios reais não foram modificados; nenhum merge/deploy foi executado. O MASTER de 259 requisitos e 20 cenários segue intacto. A CI extensa permanece por acionamento manual.

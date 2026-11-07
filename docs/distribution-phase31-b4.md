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

## Continuidade G4 — proteção de evidência duplicada (2026-11-07)

O conciliador `src/core/distribution/phase31ReturnLineage.js` agora classifica como `CONFLICT / DUPLICATE_RETURN_JOURNAL` duas entradas do livro com o mesmo ID de devolução, mesmo quando o segundo documento aparenta ser idêntico. Antes, a duplicidade poderia ser ignorada ao montar o mapa de evidências. `scripts/distribution/phase31-return-lineage.test.mjs` contém um teste negativo dedicado. **A alteração é apenas de classificação de evidência; não executa reembolso, baixa, estoque ou emissão fiscal.**

Commits: `4c81cb16962ca51d8aae5523ba70345c624c3519` (código) e `578c5e50919e7ad602ce0b02e5bb79fd889dd1fd` (teste). Resultado da CI no SHA final: **a confirmar**, não atribuir PASS. O avanço local não publicado da fixture `phase31-b3-native-v2-emulator.mjs` com recibo de R$ 450 distribuído por duas vendas/parcelas não foi substituído nem reproduzido, e permanece **sem comprovação CI** neste SHA. G4 continua PARTIAL, assim como B.4. `PREPARATION_OF_C_ALLOWED=false`; `EXECUTION_OF_C_ALLOWED=false`. Preservados 259 requisitos e 20 cenários MASTER.

## Retomada B.4 — provas nativas adicionais e G4 (2026-11-07)

**Base auditada:** `1360f615e7f86440492533beb33f9040ffbcb1a9`. O teste original `scripts/distribution/phase31-b3-native-v2-emulator.mjs` permaneceu **intacto**. O diff local perdido não foi recuperado literalmente; a capacidade informada no histórico foi reproduzida em fixture nova, evitando sobrescrever evidências.

**G2/G5 — prova multivenda independente:** `scripts/distribution/phase31-b4-multi-sale-v2-emulator.mjs` escreve duas vendas sintéticas através de **dois comandos PDV autenticados**, preservando `projetarHistoricoNovaVendaPDV` (uma venda por comando). Depois registra um único recebimento de **R$ 450**, alocado em **R$ 100** à primeira venda e **R$ 150 + R$ 200** a duas parcelas da segunda venda. Confere saldo agregado **R$ 1.600 → R$ 1.150**, único documento financeiro REC1, metadados da alocação e retry idempotente com fingerprint/guards idênticos. Nada disso comprova liquidação bancária externa.

**G4 — prova nativa adicional:** `scripts/distribution/phase31-b4-native-returns-v2-emulator.mjs` registra uma devolução parcial de **R$ 400** e outra totalizando **R$ 1.000**, com quantidades **1 + 1 / 2**, confere lançamentos internos `DEVOLUCAO-D1` e `DEVOLUCAO-D2`, classificação interna e limites, retry idempotente e recusa tentativa adicional. O saldo do cliente não é compensado e nenhum pagamento/estorno/fiscal externo é simulado. São operações sintéticas em Emulator, não homologação de todo o fluxo de tela.

**Endurecimento do conciliador:** `phase31ReturnLineage.js` detecta documentos repetidos, limites de quantidade e valor excedidos, divergência de snapshot e ausência de prova da venda original. A resposta separa `limitsVerified`, `externalSettlement:UNVERIFIED`, `fiscalAuthorization:UNVERIFIED` e `eligibleForExecution:false`. Histórico legado incompleto não pode ser promovido a compensação executável.

**Provas CI concluídas:** [smoke G2/G5 + build #42420198166](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42420198166) — SUCCESS no SHA `2b2fc7635b6348b61cf6e27fe97b8c84984dc77b`; [smoke G2/G4/G5 + testes financeiros + build #42420385476](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42420385476) — SUCCESS no SHA `e111e3db538bd56063e6900521c5e64858265dbb`. As tentativas anteriores que falharam serviram para corrigir a fixture: não são PASS.

**Regressão integrada:** [run #42420488604](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42420488604), disparada por atualização isolada de workflow no SHA `b1c8b849754a24d58414c6a9737bb34861273c40`. Registrar a conclusão **somente após consultar o resultado real**.

**Pendências:** histórico legado, reversões bancárias externas, provas de liquidação multimoeda, perfis e cross-tenant completos, concorrência de todas as modalidades, os 56 cenários exigidos e aprovação integral de G1–G10. G4 continua **PARTIAL**; G2 e G5 também **PARTIAL**. Não elevar G8/G9 sem cobertura integral. Os 259 requisitos e 20 cenários originais foram preservados.

`PREPARATION_OF_C_ALLOWED=false` e `EXECUTION_OF_C_ALLOWED=false`. Sem merge, deploy deliberado, baixa, restituição ou emissão fiscal real.

### Fechamento das provas executáveis desta retomada — CI integrada confirmada

[GitHub Actions #42420488604](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42420488604) concluiu **SUCCESS** no SHA de código/workflow `b1c8b849754a24d58414c6a9737bb34861273c40`. Etapas aprovadas: B.3 V2 client SDK obrigatório, testes de fundamento 3.1, build React, integração Firebase Emulator V2, regressões Fases 2/2.1, testes transacionais da Fase 3, concorrência Fase 3, concorrência Fase 2, Chromium desktop/mobile + integridade V2 e artifact do navegador. A smoke específica B.4 com **duas vendas e três alocações**, devolução **parcial + total + excesso bloqueado**, testes financeiros e build foi SUCCESS na execução [#42420385476](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42420385476), SHA `e111e3db538bd56063e6900521c5e64858265dbb`. Commits posteriores a esses SHAs são documentais e não promovem evidências de novos comportamentos não testados.

**Decisão:** G1–G6, G8–G9 permanecem **PARTIAL** até evidências completas, incluindo origens legadas, liquidações multimoeda externas, perfis/tenants negativos, 56 cenários de matriz, reversões já liquidadas e integração fiscal. G7 e G10 mantêm PASS histórico com escopo documentado. B.4 **PARCIAL**, `PREPARATION_OF_C_ALLOWED=false`, `EXECUTION_OF_C_ALLOWED=false`. MASTER 259 IDs / 20 cenários intactos. Nenhum merge ou execução financeira/fiscal real.

## B.4 — Etapa de blindagem G1/G6/G5 (2026-11-07)

**Base confirmada:** `319467d3c1eb21fa431ac7a72c6eab471e23645c` sem divergência. Novo teste isolado `scripts/distribution/phase31-b4-security-negative-v2-emulator.mjs`: duas contas Auth sintéticas, leitura/escrita do tenant alheio recusadas, usuário desautenticado recusado, criação de geração V2, mutação de sequência, falsificação de recibo e escrita inválida no livro financeiro recusadas pelas regras originais do Emulator. Não foram alteradas regras Firebase. **Prova:** [CI #42421634177](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42421634177), SHA `f6329d0e80cb37500b4c1ac8bfd4178d72eb5a2f`, SUCCESS, inclusive as fixtures nativas G2/G4, testes financeiros e build React.

**Limite de escopo G6:** as regras da fixture estabelecem o tenant pela propriedade do UID (`request.auth.uid==store`); a prova não constitui homologação dos papéis internos do ZenOS nem de operadores com acesso delegado. É obrigatório levantar a matriz real de permissões e provar barreiras de backend antes de G6 PASS. G1 também permanece PARTIAL até demais escritas/identidades negativas.

**G5 adicional:** `phase31-b4-multi-sale-v2-emulator.mjs` inclui tentativa de replay com mesma `operationKey` e payload divergente após retry idêntico. Resultado da nova execução CI [B4 smoke](https://github.com/itamarpassos995-eng/ZenOS/actions/workflows/distribution-phase31-b4-smoke.yml): confirmar no SHA correspondente; não declarar PASS sem confirmação. G5 permanece PARTIAL para cenários concorrentes restantes.

**Demais bloqueios preservados:** G3 multimoeda com confirmação externa, G4 legados e reversões, G8 matriz dos 56 cenários e G9 aceite integral. Os 259 requisitos e 20 cenários MASTER permanecem imutáveis. `PREPARATION_OF_C_ALLOWED=false`; `EXECUTION_OF_C_ALLOWED=false`. Sem merge, deploy deliberado ou dados reais.

## Continuidade B.4 — provas complementares G3 e G5 (2026-11-07)

**CI #42421753550:** [GitHub Actions](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42421753550), SUCCESS no SHA `86667824f41bfa668b10de4c9adac234dcf8c3b9`: tentativa de reutilizar a `operationKey` de REC1 com conteúdo divergente bloqueada, recibo original de R$ 450 preservado; além das provas nativas G2/G4 e negativas G1/G6. Isso comprova o caso negativo de replay divergente, **não** todas as disputas simultâneas de G5.

**G3 quatro moedas — nova matriz:** `scripts/distribution/phase31-b4-multicurrency.test.mjs`, com casos sintéticos de PYG→PYG, BRL→PYG com câmbio histórico atribuído, USD→BRL, USD→EUR, ausência de prova FX, falta de liquidação externa, pagamento misto e moeda/câmbio inconsistente. Valida o conciliador de domínio já existente `phase31FinancialLinks.js`, sem executar câmbio nem compensação real. **CI [#42421867393](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42421867393), SUCCESS no SHA `d85345869c3bd23f6f3b9daa86a294df419eaf5b`**, incluindo Emulator V2, casos G1/G6 e build React. Evidência de registro fictício confirmado nos testes **não é comprovação bancária externa de cliente real**. G3 continua PARTIAL até validações externas e integração completa.

**G1/G6:** CI negativa [#42421634177](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42421634177) e [#42421867393](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42421867393) SUCCESS, mas Auth por UID não comprova matriz de operadores delegados. G1/G6 PARTIAL. G2/G4/G5/G8/G9 permanecem PARTIAL até os demais cenários; G7/G10 PASS histórico. **Os 56 cenários adicionais ainda não têm aceite individual integral**. MASTER 259 requisitos / 20 cenários preservado; `PREPARATION_OF_C_ALLOWED=false`, `EXECUTION_OF_C_ALLOWED=false`.

## B.4 — continuidade G6/G5/G4/G8/G9 — 2026-11-07

**Base sem divergência:** `1595a575ab3a0bfafaae40332ad26e0e24165ed4`. Implementação existente de `distributionPermission`, PIN, sessão, fingerprint, geração e autorização em `operational-functions/src/distribution/{security,service,trips}.js` foi preservada, sem alteração de regras ou grants de produção.

**G6 — operadores:** `operational-functions/test/distribution/b4-operator-matrix.test.mjs` demonstra os escopos reais (admin; manage; driver; returns; finance+pdv; fiscalReview; produtos; pdv), bloqueio server-side para gestão por operador sem permissão, motorista não atribuído, sessão de outro tenant, revogação ao vivo de permissão e mudança de credenciais. A matriz está em [docs/distribution-phase31-b4-evidence-matrix.md](distribution-phase31-b4-evidence-matrix.md). **Não confundir isolamento de Auth/UID com autorização de operador.**

**G5 — concorrência:** `operational-functions/test/distribution/b4-concurrency-negative.test.mjs` registra duas tentativas concorrentes com chaves distintas contra a mesma revisão de viagem; somente uma devolução e somente uma reintegração devem ser aceitas. Confere quantidades e estoque. Proteções de retry e recibo financeiro de R$ 450, anteriormente comprovadas, permanecem intactas.

**G4 — legados:** `scripts/distribution/phase31-b4-legacies.test.mjs` verifica diário histórico sem `_v2`, ausência de lançamento, ID duplicado, tenant/cliente/venda divergente, excesso de quantidade/valor, snapshot incompleto e órfão. Toda classificação continua `eligibleForExecution:false`, sem restituição externa presumida.

**CI focada:** [#42422934473](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42422934473) **SUCCESS** no SHA `728189d2bacd4bc6e603e43088a60419a9b7236f`; aprovados testes G6, G5, G4, Emulator V2 de recebimento/devoluções, G1/G3 e build. Falhas das execuções anteriores foram **expectativas equivocadas na fixture de permissões** e foram corrigidas no teste; não houve concessão extra de direitos.

**G8:** fonte canônica dos 20 cenários originais de MASTER recuperada em [docs/distribution-phase31-b4-20-original-scenarios.md](distribution-phase31-b4-20-original-scenarios.md), IDs `D31-16-002` a `D31-16-021`, com cobertura individual e lacunas. A referência a **56 cenários adicionais** existe, mas a relação original e critérios individuais **não foram encontrados** na documentação nem no histórico consultado. Não inventar 56 IDs ou declarar cobertura completa.

**G9 integrado:** [#42423103191](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42423103191), SHA `aa8656f504c2de3335dc0e46e1ffe44f763eea16`, adiciona estes testes ao workflow existente e executa regressões das Fases 2/2.1/3/3.1, build e Chromium. Estado final deve ser confirmado pelo GitHub, sem inferência.

**Gate formal:** G1–G6, G8–G9 `PARTIAL` até evidências completas; G7 e G10 PASS histórico. `PREPARATION_OF_C_ALLOWED=false`, `EXECUTION_OF_C_ALLOWED=false`. Sem merge, deploy deliberado, dados reais, baixa financeira ou emissão fiscal. MASTER de 259 requisitos intacto.

### Confirmação posterior — CI G9 integrada (2026-11-07)

**GitHub Actions [#42423103191](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42423103191): SUCCESS**, SHA de execução `aa8656f504c2de3335dc0e46e1ffe44f763eea16`. Etapas aprovadas: prova cliente V2; testes 3.1 incluindo legados G4 e FX G3; build React; integração Firebase V2 incluindo operador G6 e concorrência G5; regressões de fases anteriores; Chromium desktop/mobile e evidências de navegador. **G9 mantém PARTIAL por cobertura incompleta dos 20 cenários MASTER e ausência da lista canônica dos 56 adicionais**; sucesso técnico de CI não é homologação fiscal ou bancária. Os commits posteriores ao SHA testado são exclusivamente documentais. C bloqueada.

## Revalidação da ordem MASTER — 2026-11-07

Base remota conferida antes da alteração: `cbc214b8670d446f6c0d03a71c1ad9ab58beb618`. O diff desde `aa8656f504c2de3335dc0e46e1ffe44f763eea16`, SHA da [CI integrada #42423103191](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42423103191), continha apenas documentação. O status Vercel da base retornou falha por limite de builds.

| Gate | Decisão | Evidência preservada e lacuna |
|---|---|---|
| G1 | PARTIAL | Escrita cliente V2 e negativas de autenticação/geração. Falta provar as escritas financeiras no fluxo completo de operador. |
| G2 | PARTIAL | Recebimento nativo de R$ 450 alocado entre duas vendas e parcelas. Falta a cadeia completa de renegociação e pagamento parcial legado. |
| G3 | PARTIAL | Casos BRL/PYG/USD/EUR e rejeição sem câmbio ou liquidação comprovados. Faltam evidências de integração por meio de pagamento. |
| G4 | PARTIAL | Devoluções V2 e rejeição de origens legadas incompletas ou conflitantes. Falta conciliar reversões anteriores e confirmações externas. |
| G5 | PARTIAL | Replay conflitante e disputas simultâneas dentro da distribuição. Falta a corrida integrada PDV, recebimento e devolução. |
| G6 | PARTIAL | Isolamento Firebase entre UIDs e grants no serviço de distribuição. Falta provar autorização delegada ponta a ponta para as operações financeiras do PDV. |
| G7 | PASS histórico | Preservada a prova de invalidação STALE das B.1/B.2. |
| G8 | PARTIAL | Matriz dos 20 originais com 17 PARTIAL e 3 BLOCKED. Fonte individual dos 56 adicionais indisponível nas fontes consultadas. |
| G9 | PARTIAL | CI anterior aprovada no seu SHA. A cobertura de homologação integral ainda depende de G8. |
| G10 | PASS histórico | Restrições fiscais, bancárias e financeiras seguem documentadas. |

A busca pela lista dos 56 incluiu os anexos disponíveis da conversa de origem e o histórico dos documentos no Git. As referências ao total não identificaram uma lista canônica com descrição e aceite individual. A regressão em `scripts/distribution/phase31-c-gates.test.mjs` verifica G1–G10 individualmente com estados PARTIAL/BLOCKED, SHA inválido e evidência vazia. Os dados desse teste são sintéticos e exercitam somente a regra de liberação. As oito evidências de CI anteriores e o MASTER foram preservados.

`PREPARATION_OF_C_ALLOWED=false`
`EXECUTION_OF_C_ALLOWED=false`

> **Resultado da revalidação.** A [CI integrada #42424250200](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42424250200) concluiu com SUCCESS no SHA `ab4e047154b70db29eef2e9ca85a57f5fd595513`: escrita nativa V2, testes da Fase 3.1, build React, integração Firebase Emulator, regressões anteriores, Chromium desktop/mobile e artefato do navegador. A suíte local da Fase 3.1 passou 67/67. O GitHub registrou o Vercel desse SHA como Preview automático com sucesso e `production_environment=false`. O resultado técnico preserva a decisão dos gates acima e as duas autorizações continuam falsas.

## Continuidade B.4 — recebimento parcial e devolução na mesma venda

Base remota inicial: `5bfa0dde3f7959a2de30bf1441e9804b349555f8`. Prova adicionada em `scripts/distribution/phase31-b4-native-returns-v2-emulator.mjs`, SHA `2a12e269729c76344fbaaedeb9f6ffaeb68b1696`. A etapa dedicada da [CI integrada #42425126667](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42425126667) passou com Auth e Firestore Emulator. A venda de R$ 1.000 recebe R$ 250 alocados na obrigação e parcela verificadas. Após devoluções internas de R$ 400 e R$ 600, a venda preserva a alocação, o livro preserva o recibo original e o saldo segue em R$ 750. O retry da segunda devolução é idempotente e uma terceira devolução excedente é rejeitada sem diário adicional. Os estados fiscal e de liquidação externa seguem sem comprovação. Nenhuma execução financeira da C foi habilitada.

| Gate | Decisão | IDs aplicáveis | Lacuna para aceite |
|---|---|---|---|
| G1 | PARTIAL | D31-06-002, D31-12-001 | Provar todas as escritas financeiras com identidade de operador no ponto de entrada. |
| G2 | PARTIAL | D31-06-003, D31-06-005, D31-06-019, D31-16-004 | Homologar renegociação e pagamentos parciais legados com vínculos completos. |
| G3 | PARTIAL | D31-16-019, D31-16-021 | Disponibilizar contrato/sandbox para confirmações por meio de pagamento e integrar às provas de câmbio histórico. |
| G4 | PARTIAL | D31-06-018, D31-06-020, D31-16-004 | Comprovar reversões anteriores e confirmações externas. Abatimento autorizado de D31-06-004 depende da etapa financeira. |
| G5 | PARTIAL | D31-06-008, D31-16-015, D31-16-016 | Provar corrida integrada PDV/recebimento/devolução, incluindo caixa, estoque e retomada. |
| G6 | PARTIAL | D31-12-001, D31-12-002, D31-16-018 | Demonstrar grants e revogação delegada nas operações financeiras do PDV. |
| G7 | PASS histórico | D31-09, D31-10 | Evidência de invalidação STALE preservada no escopo histórico. |
| G8 | PARTIAL | D31-16-001 a D31-16-021 | Fechar a matriz dos 20 originais e recuperar a lista canônica dos 56 adicionais. |
| G9 | PARTIAL | D31-16-001 a D31-16-021 | Cobertura de homologação ainda incompleta. |
| G10 | PASS histórico | D31-06-017, D31-06-018 | Restrições fiscais e bancárias documentadas; execução desabilitada. |

A busca dos 56 adicionais consultou os anexos já disponíveis, referências no histórico Git e branches clonadas, issues/PRs e o índice de artefatos da CI #42424250200. A busca de issues/PRs retornou o PR #56 de regras Firestore, sem lista no corpo. O índice de artefatos mostrou apenas evidência de navegador. Não foi recuperada lista individual. O Vercel reportou falha por limite de builds no SHA testado. Preparação e execução de C seguem desabilitadas.

> **Regressão final.** [CI integrada #42425126667](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42425126667) e [CI focada #42425126660](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42425126660) concluíram com SUCCESS no mesmo SHA. A integrada aprovou escrita V2, Auth/Firestore Emulator, React, regressões anteriores e Chromium desktop/mobile, com [artefato de navegador](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42425126667/artifacts/13594398837). Localmente, 67/67 testes da Fase 3.1 passaram. A prova de devolução passou também com portas locais alternativas, pois a 8080 estava ocupada. A homologação dos gates permanece parcial, com 17 cenários originais PARTIAL e três BLOCKED. PREPARATION_OF_C_ALLOWED=false e EXECUTION_OF_C_ALLOWED=false.

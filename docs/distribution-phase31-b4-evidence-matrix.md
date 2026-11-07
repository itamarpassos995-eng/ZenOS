# Fase 3.1 B.4 — Matriz de evidências G6/G5/G4/G8 (adendo, não substitui MASTER)

**Base de execução:** `1595a575ab3a0bfafaae40332ad26e0e24165ed4`. Este adendo contém apenas vínculos comprováveis entre a implementação existente e testes. Nenhum requisito do MASTER foi reenumerado.

## G6 — Autorizações realmente implementadas

Fonte: `operational-functions/src/distribution/security.js`, `service.js`, `trips.js`. O login usa operador, PIN com PBKDF2, sessão por geração, identidade do operador e fingerprint de credenciais. `authorize` relê o operador e revoga o acesso se sua permissão ou credencial mudou.

| Papel funcional já representado por permissões | Leitura/ação que a função permite | Restrições observadas |
|---|---|---|
| Administrador (`id=admin` ou `permissoes.admin`) | Todos os escopos de distribuição | Sessão e geração válidas ainda obrigatórias |
| Gestão (`distributionManage`) | `manage`, `trip`, `tripView`, `fiscalReview` | Não implica `finance` |
| Motorista (`distributionDriver`) | `driver` e `trip`; consultas driver restritas a viagem atribuída | Não implica gestão, financeiro ou estoque |
| Devoluções (`distributionReturns`) | `returns`, `trip`, `tripView` | Não implica financeiro |
| Financeiro (`distributionFinance` + `pdv`) | `finance`, `trip`, `tripView`, `pdv` | `distributionFinance` isolada não autoriza `finance` |
| Revisão fiscal (`distributionFiscalReview`) | `fiscalReview`, `trip`, `tripView` | Não autoriza emissão fiscal |
| Estoque (`produtos`) | Escopo legado `stock` | Não autoriza gestão de veículos ou financeiro |
| Comercial (`pdv`) | `pdv` | Não autoriza gestão ou financeiro sem grants adicionais |

**Provas:** `operational-functions/test/distribution/b4-operator-matrix.test.mjs` verifica a matriz e recusa alterações de rotas, baixa financeira por vendedor, motorista não atribuído, sessão de outra loja e permissões revogadas. `scripts/distribution/phase31-b4-security-negative-v2-emulator.mjs` prova isolamento entre UIDs na SDK cliente sob regras originais.

**Limite ainda não aceito:** nem toda operação do PDV/estoque fora dos serviços de distribuição é autorizada por esses mesmos grants. G6 integral depende de demonstrar a política real de ponta a ponta; uma matriz pura ou uma tela escondida não basta.

## G5 — Concorrência incremental

`operational-functions/test/distribution/b4-concurrency-negative.test.mjs`: duas devoluções simultâneas da mesma viagem com chaves distintas e mesma revisão; uma deve ser recusada sem duplicar retorno. Duas verificações de retorno para estoque com revisão concorrente; somente uma pode reintegrar. Evidências do teste são válidas somente após CI verde no respectivo SHA. Suítes prévias em `trips.test.mjs` já cobrem concorrência de recebimentos, mesmo recibo, veículo e idempotência.

**Pendente:** matriz completa de concorrência entre fiado, caixa multimoeda, parcelas e devoluções legadas fora das viagens.

## G4 — Histórico não verificável

`scripts/distribution/phase31-b4-legacies.test.mjs` cobre lançamentos anteriores sem `_v2`, vínculo de diário ausente, duplicidade, cliente/empresa/venda divergente, estorno acima da quantidade ou valor, snapshot histórico incompleto e órfãos. Em todos os casos `eligibleForExecution=false`; nenhuma fixture produz liquidação bancária ou fiscal.

**Pendente:** conciliação externa real, estorno de adquirente e todos os casos de fiado legado parcialmente pago.

## G8 — Rastreabilidade de evidência existente

| Fonte MASTER | Fluxo / cenário inspecionado | Arquivo de teste | Aceite |
|---|---|---|---|
| `D31-12-001` | Reuso de PIN/sessão/permissões | `b4-operator-matrix.test.mjs` | Condicionado à CI |
| `D31-12-002` | Grants de distribuição existentes | `b4-operator-matrix.test.mjs` | Parcial: escopo de serviço |
| `D31-07-003` | Operador autorizado no fluxo de caixa | `trips.test.mjs` | Parcial: não abrange todo PDV |
| `D31-08-001` | Reuso de estoque V2 com devoluções | `b4-concurrency-negative.test.mjs` e `trips.test.mjs` | Condicionado à CI |
| `D31-06-002` | Origem da dívida e pagamento | `phase31-b4-multi-sale-v2-emulator.mjs` | Prova sintética PASS histórico |
| `D31-06-003` | Saldo efetivamente em aberto | `phase31-b4-multi-sale-v2-emulator.mjs` | Prova sintética PASS histórico |
| `D31-10-001` | Estados separados no relatório financeiro | `phase31-b4-legacies.test.mjs` | Parcial, leitura apenas |
| `D31-16-001` | Cenários sintéticos | CI B.4 | Parcial |
| `D31-15-001` | Cache/sincronização existentes | Regressões integradas anteriores | Parcial; sem medição nova |

**56 cenários adicionais:** as versões consultadas de `docs/distribution-phase31-b4.md` e `docs/distribution-phase31-checklist.md` mencionam o total de 56, mas não fornecem aqui uma lista individual canônica de 56 IDs com descrição e critérios de aceite. **Não atribuir uma contagem de 56/56 sem recuperar a origem verificável.** Essa ausência é uma dependência documental de G8/G9, não autorização para gerar IDs históricos fictícios. O MASTER e os 20 cenários originais permanecem como referência primária.

## Decisão atual

G1, G2, G3, G4, G5, G6, G8 e G9 **PARTIAL** até todas as evidências; G7 e G10 PASS histórico. `PREPARATION_OF_C_ALLOWED=false` e `EXECUTION_OF_C_ALLOWED=false`. Este documento não realiza lançamentos, concessões, compensações ou emissão fiscal.

# B.4 — Rastreabilidade dos 20 cenários originais D31-16-002 a D31-16-021

Fonte canônica: `docs/distribution-phase31-checklist.md` seção 16, transcrição fiel do `docs/distribution-phase31-master.md` linhas 392–411. **Esta tabela não renumera os 259 requisitos e não certifica os 56 cenários adicionais, cuja lista individual de origem segue ausente.**

| ID MASTER | Cenário original | Evidência existente / cobertura específica | Estado da cobertura |
|---|---|---|---|
| D31-16-002 | Venda à vista com devolução parcial | `phase31-b4-native-returns-v2-emulator.mjs` prova devolução parcial interna, mas usa venda fiada | PARTIAL |
| D31-16-003 | Venda a prazo com abatimento de dívida | `trips.test.mjs` contém conciliação sintética de crédito por devolução | PARTIAL: sem toda cadeia fiscal |
| D31-16-004 | Venda parcialmente quitada com devolução | `phase31-b4-native-returns-v2-emulator.mjs`: venda de R$ 1.000, recebimento de R$ 250 na parcela, devoluções internas de R$ 400 e R$ 600, saldo de R$ 750 e recibo original preservados no mesmo fluxo autenticado. [Etapa aprovada na CI #42425126667](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42425126667), SHA `2a12e269729c76344fbaaedeb9f6ffaeb68b1696`. | PARTIAL: prova nativa combinada; falta jornada completa com conciliação da devolução e decisões financeira e fiscal aplicáveis |
| D31-16-005 | Falta de mercadoria na entrega | `trips.test.mjs` prova entrega parcial e reconciliação física | PARTIAL |
| D31-16-006 | Avaria e quarentena | `trips.test.mjs` contém teste de quarentena sem reintegração indevida | PARTIAL |
| D31-16-007 | Recusa total | `trips.test.mjs` cobre resultado REFUSED e quarentena | PARTIAL |
| D31-16-008 | Recusa parcial | Domínio aceita PARTIAL; falta prova dedicada de recusa parcial com critérios completos | PARTIAL |
| D31-16-009 | Substituição de produto | `phase31Commercial.js` contém candidatos REPLACEMENT/REPLENISHMENT sem movimento real | PARTIAL |
| D31-16-010 | Solicitação fiscal recusada ou pendente | Motor comercial interna impõe estados de revisão; não comprova integração fiscal externa | PARTIAL |
| D31-16-011 | Emissão fiscal simulada com protocolo fictício claramente identificado | Não há aqui comprovação individual de emissão simulada protocolada | BLOCKED |
| D31-16-012 | Estorno em espécie | Existem testes de devolução/saída, mas sem prova individual da cadeia completa de caixa e liberação | PARTIAL |
| D31-16-013 | Crédito comercial futuro | Mecanismos comerciais e financeiros existentes; ausência de prova end-to-end do caso | PARTIAL |
| D31-16-014 | Estorno de cartão pendente e posteriormente confirmado | Confirmação bancária/acquirente não comprovada nesta entrega | BLOCKED |
| D31-16-015 | Concorrência PDV e Distribuição | `trips.test.mjs` e `b4-concurrency-negative.test.mjs` cobrem disputas dentro da distribuição, mas não a corrida integrada PDV | PARTIAL |
| D31-16-016 | Cancelamento ou repetição de comando | `phase31-b4-multi-sale-v2-emulator.mjs` e `b4-concurrency-negative.test.mjs` cobrem retries/locks | PARTIAL: cancelamento ainda não integral |
| D31-16-017 | Queda de rede e retomada | Testes de retry e outbox existentes; falta prova individual completa em mobile offline | PARTIAL |
| D31-16-018 | Operador sem permissão | `b4-operator-matrix.test.mjs` prova negativas reais de serviço e mudança de credenciais | PARTIAL: demais módulos |
| D31-16-019 | Empresa paraguaia em PYG com recebimento em BRL | `phase31-b4-multicurrency.test.mjs` verifica moeda e câmbio histórico sintético read-only | PARTIAL: sem integração externa |
| D31-16-020 | Empresa brasileira com devolução fiscal apropriada | Preparação fiscal por jurisdição sem emissão habilitada; não há autorização fiscal comprovada | BLOCKED |
| D31-16-021 | Preservação de documentos históricos e taxas originais | `phase31-b4-multicurrency.test.mjs` e `phase31-b4-legacies.test.mjs` demonstram bloqueio por evidência ausente | PARTIAL |

**Sem sucesso presumido:** `PASS` individual exige teste e evidência cobrindo integralmente o cenário do MASTER, não apenas parte de seus elementos. Dados sintéticos usados nesses testes não comprovam pagamentos externos, emissão fiscal nem operações comerciais em produção.

**G8/G9:** permanecem `PARTIAL` até cobertura integral dos 20 cenários acima e recuperação da lista canônica de 56 cenários adicionais. Nenhuma alteração em produção, dados reais ou MASTER. `PREPARATION_OF_C_ALLOWED=false` e `EXECUTION_OF_C_ALLOWED=false`.

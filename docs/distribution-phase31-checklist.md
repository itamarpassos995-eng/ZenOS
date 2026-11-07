# Fase 3.1 — Matriz de rastreabilidade

> **B.4 prova adicional 2026-11-07:** G2/G5: duas vendas autenticadas separadas e um recibo de R$ 450 (R$ 100 + R$ 150 + R$ 200), saldo R$ 1.600 → R$ 1.150, retry idempotente: CI focada [#42420385476](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42420385476) SUCCESS. G4: devoluções internas parcial R$ 400 e total R$ 1.000, quantidade 2/2, bloqueio excedente, origem do livro e ausência de liquidação externa: mesma CI SUCCESS. **G2, G4, G5 continuam PARTIAL** por lacunas externas/legadas/concorrência. Full regressions [#42420488604](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42420488604) devem ser conferidas antes de marcar resultado. Não alterar os 259 IDs e 20 cenários. C bloqueada.

> **Adendo B.4 G4 (2026-11-07):** proteção de `DUPLICATE_RETURN_JOURNAL` publicada nos commits `4c81cb1` e `578c5e5`, documentada em `docs/distribution-phase31-b4.md`. Novo HEAD documental `1a9abf6`. G4 permanece **PARTIAL** até regressão/Emulator/CI; nenhuma prova anterior foi invalidada ou promovida a PASS. Os 259 IDs e 20 cenários originais continuam inalterados. Entrega C proibida.

## Referência e método

Fonte integral: [MASTER imutável](distribution-phase31-master.md), arquivo original `Texto colado(20261106-213249).txt`, recebido nesta conversa. SHA-256 dos bytes originais e da transcrição: `c63fbb599d9ffaaa359ecaeb665e4c3ae78615becb2697c9c17b21e0355e8bde`. Codificação UTF-8; terminadores originais preservados. Base confirmada no GitHub: `bd65b2754a16bde9be17712fcc6683d6e18acd64`, branch `feat/distribution-logistics-foundation`.

A transcrição é literal: não substitui termos, não elimina repetições e não transforma propostas fiscais em permissões de emissão. Cada parágrafo e cada item de lista recebe um ID estável; cabeçalhos e separadores apenas organizam a fonte. Isso inclui contexto, critérios, exceções e proibições. IDs não serão renumerados; novos requisitos entram em adendos versionados, sem editar o MASTER.

Esta entrega é exclusivamente documental. Alterações locais anteriores não publicadas não constituem implementação aceita. Os estados e provas ficam no [controle de execução](distribution-phase31-progress.md). Todo requisito permanece pendente de auditoria da Fase 3.1 até possuir arquivo, commit, teste e evidência verificáveis; a Fase 3 não é reimplementada.

## Requisitos integrais

| ID | Seção | Origem (linha inicial) | Texto integral da unidade | Aceite e evidência exigidos |
|---|---|---|---|---|
| D31-00-001 | 00 | [MASTER L4](distribution-phase31-master.md#L4) | **Projeto:** ZenOS — `itamarpassos995-eng/ZenOS` **Branch existente:** `feat/distribution-logistics-foundation` **Último commit confirmado:** `bd65b2754a16bde9be17712fcc6683d6e18acd64` | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-00-001` no controle. |
| D31-00-002 | 00 | [MASTER L8](distribution-phase31-master.md#L8) | **ATENÇÃO: ESTA É UMA ORDEM DE CONTINUIDADE, NÃO DE RECONSTRUÇÃO.** | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-00-002` no controle. |
| D31-00-003 | 00 | [MASTER L10](distribution-phase31-master.md#L10) | Atue como uma equipe sênior de engenharia de ERP, arquitetura fiscal internacional, contabilidade, logística, segurança e desenvolvimento full-stack. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-00-003` no controle. |
| D31-00-004 | 00 | [MASTER L12](distribution-phase31-master.md#L12) | A Fase 3 de Distribuição & Logística já foi implementada e testada em homologação. Sua missão é finalizar os fluxos pendentes, acrescentando a arquitetura fiscal multinacional de devoluções e Notas de Crédito. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-00-004` no controle. |
| D31-00-005 | 00 | [MASTER L14](distribution-phase31-master.md#L14) | Não repetir as Fases 1, 2, 2.1 e 3. Verificar o HEAD antes de iniciar, preservar o código existente e aproveitar integralmente as funcionalidades entregues. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-00-005` no controle. |
| D31-00-006 | 00 | [MASTER L16](distribution-phase31-master.md#L16) | **Objetivo:** permitir que uma empresa realize vendas, expedições, entregas, devoluções totais ou parciais, substituições, ajustes fiscais, estornos e acertos financeiros dentro de um único fluxo consistente, respeitando a legislação do país emissor. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-00-006` no controle. |
| D31-01-001 | 01 | [MASTER L22](distribution-phase31-master.md#L22) | A arquitetura deve separar rigorosamente: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-01-001` no controle. |
| D31-01-002 | 01 | [MASTER L24](distribution-phase31-master.md#L24) | **A. Operação logística:** o que foi expedido, entregue, recusado, devolvido, extraviado, avariado ou substituído. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-01-002` no controle. |
| D31-01-003 | 01 | [MASTER L26](distribution-phase31-master.md#L26) | **B. Operação fiscal:** fatura original, Nota de Crédito, NF-e de devolução, NF-e de entrada, cancelamento, Nota de Remisión ou outro documento legalmente aplicável. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-01-003` no controle. |
| D31-01-004 | 01 | [MASTER L28](distribution-phase31-master.md#L28) | **C. Operação financeira:** abatimento de dívida, restituição de dinheiro, estorno de cartão, transferência, crédito comercial, compensação ou ajuste de caixa. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-01-004` no controle. |
| D31-01-005 | 01 | [MASTER L30](distribution-phase31-master.md#L30) | Uma operação não deve produzir efeitos nas outras duas sem cumprir os requisitos de autorização e confirmação próprios. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-01-005` no controle. |
| D31-01-006 | 01 | [MASTER L32](distribution-phase31-master.md#L32) | **Regra absoluta:** emitir uma Nota de Crédito não significa automaticamente devolver dinheiro; registrar devolução física não significa automaticamente emitir Nota de Crédito; emitir um ajuste fiscal não significa que a compensação financeira foi concluída. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-01-006` no controle. |
| D31-02-001 | 02 | [MASTER L38](distribution-phase31-master.md#L38) | Criar uma arquitetura extensível de regras fiscais por jurisdição, sem duplicar o ZenOS ou seu módulo fiscal atual. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-02-001` no controle. |
| D31-02-002 | 02 | [MASTER L40](distribution-phase31-master.md#L40) | Prioridades iniciais: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-02-002` no controle. |
| D31-02-003 | 02 | [MASTER L42](distribution-phase31-master.md#L42) | - Paraguai: DNIT, SIFEN, e-Kuatia/e-Kuatia'i e documentos eletrônicos correspondentes. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-02-003` no controle. |
| D31-02-004 | 02 | [MASTER L43](distribution-phase31-master.md#L43) | - Brasil: SEFAZ, NF-e, documentos de devolução, entrada, cancelamento e notas de crédito nos casos regulamentados. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-02-004` no controle. |
| D31-02-005 | 02 | [MASTER L44](distribution-phase31-master.md#L44) | - Outros países: contratos extensíveis, mas sem emissão habilitada antes da implementação de suas regras. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-02-005` no controle. |
| D31-02-006 | 02 | [MASTER L46](distribution-phase31-master.md#L46) | A escolha fiscal deve respeitar a jurisdição da empresa emissora, o estabelecimento, a natureza da operação, o tipo de documento, o destinatário e as regras de localização pertinentes. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-02-006` no controle. |
| D31-02-007 | 02 | [MASTER L48](distribution-phase31-master.md#L48) | **Não determinar legislação pela moeda utilizada na venda.** | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-02-007` no controle. |
| D31-02-008 | 02 | [MASTER L50](distribution-phase31-master.md#L50) | Criar uma camada de regras fiscais versionadas que permita atualização sem reescrever os módulos de PDV, estoque e distribuição. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-02-008` no controle. |
| D31-02-009 | 02 | [MASTER L52](distribution-phase31-master.md#L52) | Antes de implementar regras específicas, consultar fontes oficiais e registrar a norma, sua vigência, âmbito de aplicação e requisitos técnicos. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-02-009` no controle. |
| D31-02-010 | 02 | [MASTER L54](distribution-phase31-master.md#L54) | Não inventar CFOP, CST, códigos tributários, prazos, formatos de XML, campos SIFEN, eventos de autorização ou critérios de incidência tributária. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-02-010` no controle. |
| D31-02-011 | 02 | [MASTER L56](distribution-phase31-master.md#L56) | Regras incertas devem permanecer bloqueadas para emissão real, com indicação de validação fiscal pendente. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-02-011` no controle. |
| D31-03-001 | 03 | [MASTER L62](distribution-phase31-master.md#L62) | Preparar o suporte às operações fiscalmente cabíveis de: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-001` no controle. |
| D31-03-002 | 03 | [MASTER L64](distribution-phase31-master.md#L64) | - Nota de Crédito Eletrônica vinculada à fatura original. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-002` no controle. |
| D31-03-003 | 03 | [MASTER L65](distribution-phase31-master.md#L65) | - Devolução total. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-003` no controle. |
| D31-03-004 | 03 | [MASTER L66](distribution-phase31-master.md#L66) | - Devolução parcial. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-004` no controle. |
| D31-03-005 | 03 | [MASTER L67](distribution-phase31-master.md#L67) | - Descontos e ajustes posteriores à faturação. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-005` no controle. |
| D31-03-006 | 03 | [MASTER L68](distribution-phase31-master.md#L68) | - Falta de mercadoria comprovada. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-006` no controle. |
| D31-03-007 | 03 | [MASTER L69](distribution-phase31-master.md#L69) | - Mercadoria entregue com avaria. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-007` no controle. |
| D31-03-008 | 03 | [MASTER L70](distribution-phase31-master.md#L70) | - Recusa de mercadoria. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-008` no controle. |
| D31-03-009 | 03 | [MASTER L71](distribution-phase31-master.md#L71) | - Substituição ou reposição. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-009` no controle. |
| D31-03-010 | 03 | [MASTER L72](distribution-phase31-master.md#L72) | - Cancelamento de documento fiscal, exclusivamente quando permitido. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-010` no controle. |
| D31-03-011 | 03 | [MASTER L73](distribution-phase31-master.md#L73) | - Nota de Remisión nos casos em que ela seja exigida ou aplicável. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-011` no controle. |
| D31-03-012 | 03 | [MASTER L75](distribution-phase31-master.md#L75) | Verificar a regulamentação atual da DNIT/SIFEN, inclusive requisitos de referência ao CDC, eventos do destinatário, consentimento quando exigível, prazos e diferenças entre sistemas de faturação eletrônica. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-012` no controle. |
| D31-03-013 | 03 | [MASTER L77](distribution-phase31-master.md#L77) | **Nunca confundir inadimplência com devolução fiscal.** | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-013` no controle. |
| D31-03-014 | 03 | [MASTER L79](distribution-phase31-master.md#L79) | Uma fatura simplesmente não paga não autoriza a criação automática de uma Nota de Crédito. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-014` no controle. |
| D31-03-015 | 03 | [MASTER L81](distribution-phase31-master.md#L81) | A Nota de Crédito deverá conter o vínculo com a fatura, os itens, as quantidades, os valores, as referências fiscais e os motivos legalmente permitidos. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-015` no controle. |
| D31-03-016 | 03 | [MASTER L83](distribution-phase31-master.md#L83) | Preparar integração real com provedor SIFEN autorizado, aproveitando a infraestrutura fiscal já existente no ZenOS. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-016` no controle. |
| D31-03-017 | 03 | [MASTER L85](distribution-phase31-master.md#L85) | Nenhum documento poderá ser apresentado como aprovado sem confirmação real do órgão ou provedor fiscal competente. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-03-017` no controle. |
| D31-04-001 | 04 | [MASTER L91](distribution-phase31-master.md#L91) | Criar adaptador brasileiro independente. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-04-001` no controle. |
| D31-04-002 | 04 | [MASTER L93](distribution-phase31-master.md#L93) | Considerar, conforme as regras vigentes e o enquadramento da operação: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-04-002` no controle. |
| D31-04-003 | 04 | [MASTER L95](distribution-phase31-master.md#L95) | - NF-e de devolução. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-04-003` no controle. |
| D31-04-004 | 04 | [MASTER L96](distribution-phase31-master.md#L96) | - NF-e de entrada para retorno de mercadorias, quando cabível. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-04-004` no controle. |
| D31-04-005 | 04 | [MASTER L97](distribution-phase31-master.md#L97) | - Cancelamento autorizado. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-04-005` no controle. |
| D31-04-006 | 04 | [MASTER L98](distribution-phase31-master.md#L98) | - Eventos de recusa ou não entrega. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-04-006` no controle. |
| D31-04-007 | 04 | [MASTER L99](distribution-phase31-master.md#L99) | - NF-e com finalidade de Nota de Crédito, nos casos regulamentados. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-04-007` no controle. |
| D31-04-008 | 04 | [MASTER L100](distribution-phase31-master.md#L100) | - Devolução parcial ou total. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-04-008` no controle. |
| D31-04-009 | 04 | [MASTER L101](distribution-phase31-master.md#L101) | - Substituição de produtos. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-04-009` no controle. |
| D31-04-010 | 04 | [MASTER L102](distribution-phase31-master.md#L102) | - Ajustes fiscais vinculados à operação original. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-04-010` no controle. |
| D31-04-011 | 04 | [MASTER L104](distribution-phase31-master.md#L104) | Validar as normas aplicáveis do Ajuste SINIEF, da SEFAZ competente e as obrigações relativas à reforma tributária. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-04-011` no controle. |
| D31-04-012 | 04 | [MASTER L106](distribution-phase31-master.md#L106) | Não supor que um único documento fiscal sirva para todos os estados ou regimes tributários. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-04-012` no controle. |
| D31-04-013 | 04 | [MASTER L108](distribution-phase31-master.md#L108) | Os códigos fiscais, referências, impostos e efeitos contábeis devem ser resolvidos conforme configuração fiscal validada, não por valores fixos no frontend. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-04-013` no controle. |
| D31-04-014 | 04 | [MASTER L110](distribution-phase31-master.md#L110) | Preservar XML, chaves de acesso, protocolos, recibos, eventos e documentos originais. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-04-014` no controle. |
| D31-05-001 | 05 | [MASTER L116](distribution-phase31-master.md#L116) | Implementar uma Central de Ocorrências integrada à Central de Distribuição. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-001` no controle. |
| D31-05-002 | 05 | [MASTER L118](distribution-phase31-master.md#L118) | Tipos iniciais: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-002` no controle. |
| D31-05-003 | 05 | [MASTER L120](distribution-phase31-master.md#L120) | - Falta de mercadoria na separação. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-003` no controle. |
| D31-05-004 | 05 | [MASTER L121](distribution-phase31-master.md#L121) | - Falta na entrega. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-004` no controle. |
| D31-05-005 | 05 | [MASTER L122](distribution-phase31-master.md#L122) | - Entrega parcial. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-005` no controle. |
| D31-05-006 | 05 | [MASTER L123](distribution-phase31-master.md#L123) | - Avaria. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-006` no controle. |
| D31-05-007 | 05 | [MASTER L124](distribution-phase31-master.md#L124) | - Recusa total. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-007` no controle. |
| D31-05-008 | 05 | [MASTER L125](distribution-phase31-master.md#L125) | - Recusa parcial. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-008` no controle. |
| D31-05-009 | 05 | [MASTER L126](distribution-phase31-master.md#L126) | - Devolução posterior. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-009` no controle. |
| D31-05-010 | 05 | [MASTER L127](distribution-phase31-master.md#L127) | - Produto incorreto. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-010` no controle. |
| D31-05-011 | 05 | [MASTER L128](distribution-phase31-master.md#L128) | - Substituição. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-011` no controle. |
| D31-05-012 | 05 | [MASTER L129](distribution-phase31-master.md#L129) | - Extravio. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-012` no controle. |
| D31-05-013 | 05 | [MASTER L130](distribution-phase31-master.md#L130) | - Divergência entre fatura e entrega. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-013` no controle. |
| D31-05-014 | 05 | [MASTER L132](distribution-phase31-master.md#L132) | Cada ocorrência deverá permitir registrar: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-014` no controle. |
| D31-05-015 | 05 | [MASTER L134](distribution-phase31-master.md#L134) | - Empresa e estabelecimento. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-015` no controle. |
| D31-05-016 | 05 | [MASTER L135](distribution-phase31-master.md#L135) | - Pedido e venda original. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-016` no controle. |
| D31-05-017 | 05 | [MASTER L136](distribution-phase31-master.md#L136) | - Fatura ou documento fiscal correspondente. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-017` no controle. |
| D31-05-018 | 05 | [MASTER L137](distribution-phase31-master.md#L137) | - Romaneio e viagem. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-018` no controle. |
| D31-05-019 | 05 | [MASTER L138](distribution-phase31-master.md#L138) | - Cliente e vendedor. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-019` no controle. |
| D31-05-020 | 05 | [MASTER L139](distribution-phase31-master.md#L139) | - Produto, unidade e quantidade. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-020` no controle. |
| D31-05-021 | 05 | [MASTER L140](distribution-phase31-master.md#L140) | - Valor e moeda original. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-021` no controle. |
| D31-05-022 | 05 | [MASTER L141](distribution-phase31-master.md#L141) | - Motivo e descrição. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-022` no controle. |
| D31-05-023 | 05 | [MASTER L142](distribution-phase31-master.md#L142) | - Fotografias, assinatura e evidências quando aplicáveis. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-023` no controle. |
| D31-05-024 | 05 | [MASTER L143](distribution-phase31-master.md#L143) | - Responsável e permissões. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-024` no controle. |
| D31-05-025 | 05 | [MASTER L144](distribution-phase31-master.md#L144) | - Datas do acontecimento e da confirmação no servidor. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-025` no controle. |
| D31-05-026 | 05 | [MASTER L145](distribution-phase31-master.md#L145) | - Estado logístico, fiscal e financeiro, separadamente. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-026` no controle. |
| D31-05-027 | 05 | [MASTER L147](distribution-phase31-master.md#L147) | Criar histórico auditável e impedir duplicidade de ocorrências ou ajustes associados ao mesmo fato. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-027` no controle. |
| D31-05-028 | 05 | [MASTER L149](distribution-phase31-master.md#L149) | Uma ocorrência poderá resultar em vários desdobramentos autorizados, mas jamais em compensações repetidas. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-05-028` no controle. |
| D31-06-001 | 06 | [MASTER L157](distribution-phase31-master.md#L157) | Após ajuste fiscal válido e autorização financeira: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-001` no controle. |
| D31-06-002 | 06 | [MASTER L159](distribution-phase31-master.md#L159) | - Identificar a dívida original. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-002` no controle. |
| D31-06-003 | 06 | [MASTER L160](distribution-phase31-master.md#L160) | - Determinar o saldo efetivamente aberto. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-003` no controle. |
| D31-06-004 | 06 | [MASTER L161](distribution-phase31-master.md#L161) | - Abater o valor autorizado no contas a receber. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-004` no controle. |
| D31-06-005 | 06 | [MASTER L162](distribution-phase31-master.md#L162) | - Preservar parcelas já quitadas e histórico de pagamentos. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-005` no controle. |
| D31-06-006 | 06 | [MASTER L163](distribution-phase31-master.md#L163) | - Tratar eventual valor pago em excesso como restituição ou crédito comercial autorizado. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-006` no controle. |
| D31-06-007 | 06 | [MASTER L164](distribution-phase31-master.md#L164) | - Não registrar recebimento negativo fictício. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-007` no controle. |
| D31-06-008 | 06 | [MASTER L165](distribution-phase31-master.md#L165) | - Não duplicar descontos nem compensações. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-008` no controle. |
| D31-06-009 | 06 | [MASTER L167](distribution-phase31-master.md#L167) | O lançamento deve ser rastreável à venda, à ocorrência, ao ajuste fiscal e à aprovação financeira. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-009` no controle. |
| D31-06-010 | 06 | [MASTER L171](distribution-phase31-master.md#L171) | Permitir, conforme autorização e regras aplicáveis: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-010` no controle. |
| D31-06-011 | 06 | [MASTER L173](distribution-phase31-master.md#L173) | - Devolução de dinheiro físico. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-011` no controle. |
| D31-06-012 | 06 | [MASTER L174](distribution-phase31-master.md#L174) | - Estorno de cartão. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-012` no controle. |
| D31-06-013 | 06 | [MASTER L175](distribution-phase31-master.md#L175) | - Transferência. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-013` no controle. |
| D31-06-014 | 06 | [MASTER L176](distribution-phase31-master.md#L176) | - Crédito comercial para compra futura. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-014` no controle. |
| D31-06-015 | 06 | [MASTER L177](distribution-phase31-master.md#L177) | - Substituição do produto. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-015` no controle. |
| D31-06-016 | 06 | [MASTER L179](distribution-phase31-master.md#L179) | Cada modalidade deve ter controle próprio. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-016` no controle. |
| D31-06-017 | 06 | [MASTER L181](distribution-phase31-master.md#L181) | O ZenOS não deverá marcar um reembolso como realizado apenas porque o operador solicitou a operação. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-017` no controle. |
| D31-06-018 | 06 | [MASTER L183](distribution-phase31-master.md#L183) | Estornos externos dependem de confirmação do meio de pagamento ou de evidência de execução. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-018` no controle. |
| D31-06-019 | 06 | [MASTER L187](distribution-phase31-master.md#L187) | Criar tratamento específico para vendas com parte paga e parte pendente. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-019` no controle. |
| D31-06-020 | 06 | [MASTER L189](distribution-phase31-master.md#L189) | Primeiro reconciliar a dívida, os valores já recebidos e as compensações existentes. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-020` no controle. |
| D31-06-021 | 06 | [MASTER L191](distribution-phase31-master.md#L191) | Não gerar saldo credor ou reembolso sem verificar o histórico. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-06-021` no controle. |
| D31-07-001 | 07 | [MASTER L197](distribution-phase31-master.md#L197) | Reutilizar o caixa multimoeda existente do ZenOS. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-07-001` no controle. |
| D31-07-002 | 07 | [MASTER L199](distribution-phase31-master.md#L199) | Para devoluções físicas em espécie: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-07-002` no controle. |
| D31-07-003 | 07 | [MASTER L201](distribution-phase31-master.md#L201) | - Validar operador e permissão. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-07-003` no controle. |
| D31-07-004 | 07 | [MASTER L202](distribution-phase31-master.md#L202) | - Validar sessão de caixa aberta. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-07-004` no controle. |
| D31-07-005 | 07 | [MASTER L203](distribution-phase31-master.md#L203) | - Identificar a moeda original e a moeda efetivamente devolvida. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-07-005` no controle. |
| D31-07-006 | 07 | [MASTER L204](distribution-phase31-master.md#L204) | - Verificar saldo disponível conforme a política de caixa. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-07-006` no controle. |
| D31-07-007 | 07 | [MASTER L205](distribution-phase31-master.md#L205) | - Exigir confirmação e comprovante. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-07-007` no controle. |
| D31-07-008 | 07 | [MASTER L206](distribution-phase31-master.md#L206) | - Registrar saída de caixa vinculada à ocorrência. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-07-008` no controle. |
| D31-07-009 | 07 | [MASTER L207](distribution-phase31-master.md#L207) | - Gerar documento e lançamento financeiro correspondentes quando autorizados. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-07-009` no controle. |
| D31-07-010 | 07 | [MASTER L208](distribution-phase31-master.md#L208) | - Manter idempotência absoluta. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-07-010` no controle. |
| D31-07-011 | 07 | [MASTER L210](distribution-phase31-master.md#L210) | **Jamais somar PYG, BRL, USD e EUR como se fossem a mesma moeda.** | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-07-011` no controle. |
| D31-07-012 | 07 | [MASTER L212](distribution-phase31-master.md#L212) | Conversão entre moedas deve exigir autorização explícita, taxa registrada e comprovação da operação. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-07-012` no controle. |
| D31-07-013 | 07 | [MASTER L214](distribution-phase31-master.md#L214) | Preservar valores históricos sem conversões retroativas. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-07-013` no controle. |
| D31-08-001 | 08 | [MASTER L220](distribution-phase31-master.md#L220) | Reutilizar a arquitetura de estoque V2 já implementada. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-08-001` no controle. |
| D31-08-002 | 08 | [MASTER L222](distribution-phase31-master.md#L222) | Separar: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-08-002` no controle. |
| D31-08-003 | 08 | [MASTER L224](distribution-phase31-master.md#L224) | 1. Mercadoria em trânsito. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-08-003` no controle. |
| D31-08-004 | 08 | [MASTER L225](distribution-phase31-master.md#L225) | 2. Mercadoria recusada. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-08-004` no controle. |
| D31-08-005 | 08 | [MASTER L226](distribution-phase31-master.md#L226) | 3. Mercadoria devolvida. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-08-005` no controle. |
| D31-08-006 | 08 | [MASTER L227](distribution-phase31-master.md#L227) | 4. Mercadoria aguardando conferência. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-08-006` no controle. |
| D31-08-007 | 08 | [MASTER L228](distribution-phase31-master.md#L228) | 5. Mercadoria aprovada para reintegração. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-08-007` no controle. |
| D31-08-008 | 08 | [MASTER L229](distribution-phase31-master.md#L229) | 6. Mercadoria avariada em quarentena. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-08-008` no controle. |
| D31-08-009 | 08 | [MASTER L230](distribution-phase31-master.md#L230) | 7. Mercadoria substituída ou baixada definitivamente. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-08-009` no controle. |
| D31-08-010 | 08 | [MASTER L232](distribution-phase31-master.md#L232) | A entrada no estoque vendável somente poderá ocorrer após conferência e autorização. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-08-010` no controle. |
| D31-08-011 | 08 | [MASTER L234](distribution-phase31-master.md#L234) | Nunca aumentar estoque duas vezes para uma mesma devolução. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-08-011` no controle. |
| D31-08-012 | 08 | [MASTER L236](distribution-phase31-master.md#L236) | Manter rastreabilidade de custo, quantidades, origem, lotes quando suportados, pedido e fatura. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-08-012` no controle. |
| D31-08-013 | 08 | [MASTER L238](distribution-phase31-master.md#L238) | Não criar outro cadastro de produtos ou estoque paralelo. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-08-013` no controle. |
| D31-09-001 | 09 | [MASTER L244](distribution-phase31-master.md#L244) | Implementar fluxo específico quando o cliente deseja receber outro produto ou completar quantidades faltantes em vez de receber dinheiro. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-09-001` no controle. |
| D31-09-002 | 09 | [MASTER L246](distribution-phase31-master.md#L246) | Exigir: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-09-002` no controle. |
| D31-09-003 | 09 | [MASTER L248](distribution-phase31-master.md#L248) | - Referência ao pedido original. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-09-003` no controle. |
| D31-09-004 | 09 | [MASTER L249](distribution-phase31-master.md#L249) | - Registro da ocorrência. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-09-004` no controle. |
| D31-09-005 | 09 | [MASTER L250](distribution-phase31-master.md#L250) | - Nova separação autorizada. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-09-005` no controle. |
| D31-09-006 | 09 | [MASTER L251](distribution-phase31-master.md#L251) | - Controle de carga e romaneio. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-09-006` no controle. |
| D31-09-007 | 09 | [MASTER L252](distribution-phase31-master.md#L252) | - Tratamento fiscal correspondente, quando exigido. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-09-007` no controle. |
| D31-09-008 | 09 | [MASTER L253](distribution-phase31-master.md#L253) | - Reserva e movimentação de estoque corretas. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-09-008` no controle. |
| D31-09-009 | 09 | [MASTER L254](distribution-phase31-master.md#L254) | - Prevenção contra faturamento ou baixa duplicada. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-09-009` no controle. |
| D31-09-010 | 09 | [MASTER L256](distribution-phase31-master.md#L256) | A substituição não poderá ser tratada automaticamente como venda nova nem como simples estorno. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-09-010` no controle. |
| D31-10-001 | 10 | [MASTER L262](distribution-phase31-master.md#L262) | Criar uma visão de conciliação que mostre, em campos independentes: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-001` no controle. |
| D31-10-002 | 10 | [MASTER L264](distribution-phase31-master.md#L264) | - Valor da venda original. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-002` no controle. |
| D31-10-003 | 10 | [MASTER L265](distribution-phase31-master.md#L265) | - Valor fiscal ajustado. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-003` no controle. |
| D31-10-004 | 10 | [MASTER L266](distribution-phase31-master.md#L266) | - Valor efetivamente recebido. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-004` no controle. |
| D31-10-005 | 10 | [MASTER L267](distribution-phase31-master.md#L267) | - Valor ainda devido. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-005` no controle. |
| D31-10-006 | 10 | [MASTER L268](distribution-phase31-master.md#L268) | - Valor devolvido. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-006` no controle. |
| D31-10-007 | 10 | [MASTER L269](distribution-phase31-master.md#L269) | - Valor disponível como crédito comercial. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-007` no controle. |
| D31-10-008 | 10 | [MASTER L270](distribution-phase31-master.md#L270) | - Valor de mercadoria em trânsito ou devolvida. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-008` no controle. |
| D31-10-009 | 10 | [MASTER L271](distribution-phase31-master.md#L271) | - Pendências fiscais. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-009` no controle. |
| D31-10-010 | 10 | [MASTER L272](distribution-phase31-master.md#L272) | - Pendências financeiras. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-010` no controle. |
| D31-10-011 | 10 | [MASTER L273](distribution-phase31-master.md#L273) | - Divergências de caixa e acerto. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-011` no controle. |
| D31-10-012 | 10 | [MASTER L275](distribution-phase31-master.md#L275) | Permitir reconhecer diferenças justificadas por usuários autorizados, com trilha de auditoria. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-012` no controle. |
| D31-10-013 | 10 | [MASTER L277](distribution-phase31-master.md#L277) | **Não lançar receita, despesa, perda ou ganho automaticamente para esconder divergências.** | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-013` no controle. |
| D31-10-014 | 10 | [MASTER L279](distribution-phase31-master.md#L279) | Impedir pagamento duplicado, desconto repetido, estorno em duplicidade e encerramento falso de acertos. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-014` no controle. |
| D31-10-015 | 10 | [MASTER L281](distribution-phase31-master.md#L281) | Preservar a escrituração e os contratos financeiros existentes. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-10-015` no controle. |
| D31-11-001 | 11 | [MASTER L287](distribution-phase31-master.md#L287) | Produzir documentos profissionais, no padrão visual ZenOS: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-11-001` no controle. |
| D31-11-002 | 11 | [MASTER L289](distribution-phase31-master.md#L289) | - Relatório de ocorrência. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-11-002` no controle. |
| D31-11-003 | 11 | [MASTER L290](distribution-phase31-master.md#L290) | - Comprovante de devolução física. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-11-003` no controle. |
| D31-11-004 | 11 | [MASTER L291](distribution-phase31-master.md#L291) | - Comprovante de estorno financeiro. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-11-004` no controle. |
| D31-11-005 | 11 | [MASTER L292](distribution-phase31-master.md#L292) | - Relatório de conferência. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-11-005` no controle. |
| D31-11-006 | 11 | [MASTER L293](distribution-phase31-master.md#L293) | - Comprovante de substituição. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-11-006` no controle. |
| D31-11-007 | 11 | [MASTER L294](distribution-phase31-master.md#L294) | - Espelho de Nota de Crédito ou devolução fiscal. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-11-007` no controle. |
| D31-11-008 | 11 | [MASTER L295](distribution-phase31-master.md#L295) | - Histórico de documentos fiscais aprovados. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-11-008` no controle. |
| D31-11-009 | 11 | [MASTER L296](distribution-phase31-master.md#L296) | - Segunda via de documentos. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-11-009` no controle. |
| D31-11-010 | 11 | [MASTER L298](distribution-phase31-master.md#L298) | PDFs e impressões devem preservar os snapshots originais e indicar claramente o estado fiscal. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-11-010` no controle. |
| D31-11-011 | 11 | [MASTER L300](distribution-phase31-master.md#L300) | Um espelho ou documento interno não poderá se apresentar como documento fiscal eletrônico autorizado. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-11-011` no controle. |
| D31-11-012 | 11 | [MASTER L302](distribution-phase31-master.md#L302) | Permitir reimpressão de documentos antigos sem recalcular preços ou câmbio usando valores atuais. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-11-012` no controle. |
| D31-12-001 | 12 | [MASTER L308](distribution-phase31-master.md#L308) | Reutilizar o sistema de usuários, PIN e permissões existente. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-12-001` no controle. |
| D31-12-002 | 12 | [MASTER L310](distribution-phase31-master.md#L310) | Criar ou ampliar permissões granulares, conforme necessário, para: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-12-002` no controle. |
| D31-12-003 | 12 | [MASTER L312](distribution-phase31-master.md#L312) | - Registrar ocorrência. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-12-003` no controle. |
| D31-12-004 | 12 | [MASTER L313](distribution-phase31-master.md#L313) | - Conferir devolução. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-12-004` no controle. |
| D31-12-005 | 12 | [MASTER L314](distribution-phase31-master.md#L314) | - Autorizar reintegração. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-12-005` no controle. |
| D31-12-006 | 12 | [MASTER L315](distribution-phase31-master.md#L315) | - Solicitar ajuste fiscal. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-12-006` no controle. |
| D31-12-007 | 12 | [MASTER L316](distribution-phase31-master.md#L316) | - Autorizar emissão fiscal. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-12-007` no controle. |
| D31-12-008 | 12 | [MASTER L317](distribution-phase31-master.md#L317) | - Aprovar restituição. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-12-008` no controle. |
| D31-12-009 | 12 | [MASTER L318](distribution-phase31-master.md#L318) | - Executar estorno de caixa. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-12-009` no controle. |
| D31-12-010 | 12 | [MASTER L319](distribution-phase31-master.md#L319) | - Resolver divergência. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-12-010` no controle. |
| D31-12-011 | 12 | [MASTER L320](distribution-phase31-master.md#L320) | - Consultar auditorias. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-12-011` no controle. |
| D31-12-012 | 12 | [MASTER L322](distribution-phase31-master.md#L322) | Todas as autorizações críticas devem ser verificadas no servidor. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-12-012` no controle. |
| D31-12-013 | 12 | [MASTER L324](distribution-phase31-master.md#L324) | Utilizar revisões otimistas, transações, recibos idempotentes e trilhas imutáveis. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-12-013` no controle. |
| D31-12-014 | 12 | [MASTER L326](distribution-phase31-master.md#L326) | Não confiar em valores, permissões ou documentos enviados diretamente pelo frontend. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-12-014` no controle. |
| D31-13-001 | 13 | [MASTER L332](distribution-phase31-master.md#L332) | Finalizar a robustez da operação offline iniciada na Fase 3. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-13-001` no controle. |
| D31-13-002 | 13 | [MASTER L334](distribution-phase31-master.md#L334) | Testar: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-13-002` no controle. |
| D31-13-003 | 13 | [MASTER L336](distribution-phase31-master.md#L336) | - Fechamento do aplicativo sem conexão. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-13-003` no controle. |
| D31-13-004 | 13 | [MASTER L337](distribution-phase31-master.md#L337) | - Reabertura offline. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-13-004` no controle. |
| D31-13-005 | 13 | [MASTER L338](distribution-phase31-master.md#L338) | - Permanência da fila local. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-13-005` no controle. |
| D31-13-006 | 13 | [MASTER L339](distribution-phase31-master.md#L339) | - Reconexão. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-13-006` no controle. |
| D31-13-007 | 13 | [MASTER L340](distribution-phase31-master.md#L340) | - Comandos repetidos. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-13-007` no controle. |
| D31-13-008 | 13 | [MASTER L341](distribution-phase31-master.md#L341) | - Conflitos de revisão. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-13-008` no controle. |
| D31-13-009 | 13 | [MASTER L342](distribution-phase31-master.md#L342) | - Operador com permissão revogada. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-13-009` no controle. |
| D31-13-010 | 13 | [MASTER L343](distribution-phase31-master.md#L343) | - Aplicativo fechado durante sincronização. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-13-010` no controle. |
| D31-13-011 | 13 | [MASTER L345](distribution-phase31-master.md#L345) | Não armazenar PIN ou credenciais sensíveis de forma insegura. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-13-011` no controle. |
| D31-13-012 | 13 | [MASTER L347](distribution-phase31-master.md#L347) | Ações offline não podem aparecer como confirmadas até validação do servidor. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-13-012` no controle. |
| D31-13-013 | 13 | [MASTER L349](distribution-phase31-master.md#L349) | Documentos fiscais e estornos financeiros não poderão ser declarados executados sem confirmação remota. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-13-013` no controle. |
| D31-13-014 | 13 | [MASTER L351](distribution-phase31-master.md#L351) | Implementar resolução assistida para conflitos comerciais, preservando o histórico de tentativas e impedindo compensações duplicadas. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-13-014` no controle. |
| D31-14-001 | 14 | [MASTER L357](distribution-phase31-master.md#L357) | Preparar integração com o ZenOS Control Center existente. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-14-001` no controle. |
| D31-14-002 | 14 | [MASTER L359](distribution-phase31-master.md#L359) | O módulo Distribuição deve ser habilitado comercialmente por empresa, conforme permissões e contratação. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-14-002` no controle. |
| D31-14-003 | 14 | [MASTER L361](distribution-phase31-master.md#L361) | Não reconstruir o Control Center nem criar outro painel administrativo. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-14-003` no controle. |
| D31-14-004 | 14 | [MASTER L363](distribution-phase31-master.md#L363) | Preservar isolamento multitenant, segurança e baixo consumo de Firestore. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-14-004` no controle. |
| D31-14-005 | 14 | [MASTER L365](distribution-phase31-master.md#L365) | Se a integração depender de contratos ainda não disponíveis, implementar adaptadores de homologação e registrar o bloqueio sem alegar que o serviço real está pronto. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-14-005` no controle. |
| D31-15-001 | 15 | [MASTER L371](distribution-phase31-master.md#L371) | Preservar a arquitetura atual de cache e sincronização. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-15-001` no controle. |
| D31-15-002 | 15 | [MASTER L373](distribution-phase31-master.md#L373) | Obrigatório: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-15-002` no controle. |
| D31-15-003 | 15 | [MASTER L375](distribution-phase31-master.md#L375) | - Carregamento sob demanda. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-15-003` no controle. |
| D31-15-004 | 15 | [MASTER L376](distribution-phase31-master.md#L376) | - Paginação. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-15-004` no controle. |
| D31-15-005 | 15 | [MASTER L377](distribution-phase31-master.md#L377) | - Filtro Hoje como padrão. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-15-005` no controle. |
| D31-15-006 | 15 | [MASTER L378](distribution-phase31-master.md#L378) | - Nenhum listener novo no boot do ZenOS quando Distribuição estiver desativada. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-15-006` no controle. |
| D31-15-007 | 15 | [MASTER L379](distribution-phase31-master.md#L379) | - Consultas restritas à empresa. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-15-007` no controle. |
| D31-15-008 | 15 | [MASTER L380](distribution-phase31-master.md#L380) | - Nada de baixar histórico completo para emitir um ajuste. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-15-008` no controle. |
| D31-15-009 | 15 | [MASTER L381](distribution-phase31-master.md#L381) | - Nenhum polling desnecessário. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-15-009` no controle. |
| D31-15-010 | 15 | [MASTER L382](distribution-phase31-master.md#L382) | - Operações idempotentes e transacionais. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-15-010` no controle. |
| D31-15-011 | 15 | [MASTER L384](distribution-phase31-master.md#L384) | Não migrar para PostgreSQL apenas por conveniência. Qualquer mudança estrutural deverá ter justificativa técnica, homologação e autorização separada. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-15-011` no controle. |
| D31-16-001 | 16 | [MASTER L390](distribution-phase31-master.md#L390) | Criar cenários sintéticos de: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-001` no controle. |
| D31-16-002 | 16 | [MASTER L392](distribution-phase31-master.md#L392) | 1. Venda à vista com devolução parcial. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-002` no controle. |
| D31-16-003 | 16 | [MASTER L393](distribution-phase31-master.md#L393) | 2. Venda a prazo com abatimento de dívida. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-003` no controle. |
| D31-16-004 | 16 | [MASTER L394](distribution-phase31-master.md#L394) | 3. Venda parcialmente quitada com devolução. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-004` no controle. |
| D31-16-005 | 16 | [MASTER L395](distribution-phase31-master.md#L395) | 4. Falta de mercadoria na entrega. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-005` no controle. |
| D31-16-006 | 16 | [MASTER L396](distribution-phase31-master.md#L396) | 5. Avaria e quarentena. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-006` no controle. |
| D31-16-007 | 16 | [MASTER L397](distribution-phase31-master.md#L397) | 6. Recusa total. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-007` no controle. |
| D31-16-008 | 16 | [MASTER L398](distribution-phase31-master.md#L398) | 7. Recusa parcial. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-008` no controle. |
| D31-16-009 | 16 | [MASTER L399](distribution-phase31-master.md#L399) | 8. Substituição de produto. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-009` no controle. |
| D31-16-010 | 16 | [MASTER L400](distribution-phase31-master.md#L400) | 9. Solicitação fiscal recusada ou pendente. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-010` no controle. |
| D31-16-011 | 16 | [MASTER L401](distribution-phase31-master.md#L401) | 10. Emissão fiscal simulada com protocolo fictício claramente identificado. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-011` no controle. |
| D31-16-012 | 16 | [MASTER L402](distribution-phase31-master.md#L402) | 11. Estorno em espécie. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-012` no controle. |
| D31-16-013 | 16 | [MASTER L403](distribution-phase31-master.md#L403) | 12. Crédito comercial futuro. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-013` no controle. |
| D31-16-014 | 16 | [MASTER L404](distribution-phase31-master.md#L404) | 13. Estorno de cartão pendente e posteriormente confirmado. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-014` no controle. |
| D31-16-015 | 16 | [MASTER L405](distribution-phase31-master.md#L405) | 14. Concorrência PDV e Distribuição. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-015` no controle. |
| D31-16-016 | 16 | [MASTER L406](distribution-phase31-master.md#L406) | 15. Cancelamento ou repetição de comando. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-016` no controle. |
| D31-16-017 | 16 | [MASTER L407](distribution-phase31-master.md#L407) | 16. Queda de rede e retomada. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-017` no controle. |
| D31-16-018 | 16 | [MASTER L408](distribution-phase31-master.md#L408) | 17. Operador sem permissão. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-018` no controle. |
| D31-16-019 | 16 | [MASTER L409](distribution-phase31-master.md#L409) | 18. Empresa paraguaia em PYG com recebimento em BRL. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-019` no controle. |
| D31-16-020 | 16 | [MASTER L410](distribution-phase31-master.md#L410) | 19. Empresa brasileira com devolução fiscal apropriada. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-020` no controle. |
| D31-16-021 | 16 | [MASTER L411](distribution-phase31-master.md#L411) | 20. Preservação de documentos históricos e taxas originais. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-021` no controle. |
| D31-16-022 | 16 | [MASTER L413](distribution-phase31-master.md#L413) | Testar no Firebase Emulator e em navegador desktop/mobile. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-022` no controle. |
| D31-16-023 | 16 | [MASTER L415](distribution-phase31-master.md#L415) | Não usar credenciais fiscais reais nem emitir documentos de produção. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-023` no controle. |
| D31-16-024 | 16 | [MASTER L417](distribution-phase31-master.md#L417) | Exigir aprovação de regressões dos módulos existentes de caixa, PDV, estoque, multimoeda, financeiro e logística. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-16-024` no controle. |
| D31-17-001 | 17 | [MASTER L423](distribution-phase31-master.md#L423) | Entregar: | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-001` no controle. |
| D31-17-002 | 17 | [MASTER L425](distribution-phase31-master.md#L425) | - Código implementado na branch existente. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-002` no controle. |
| D31-17-003 | 17 | [MASTER L426](distribution-phase31-master.md#L426) | - Commit e lista de arquivos alterados. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-003` no controle. |
| D31-17-004 | 17 | [MASTER L427](distribution-phase31-master.md#L427) | - Arquitetura fiscal documentada por país. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-004` no controle. |
| D31-17-005 | 17 | [MASTER L428](distribution-phase31-master.md#L428) | - Matriz de regras fiscais com fontes oficiais, vigência e status de validação. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-005` no controle. |
| D31-17-006 | 17 | [MASTER L429](distribution-phase31-master.md#L429) | - Testes executados e resultados. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-006` no controle. |
| D31-17-007 | 17 | [MASTER L430](distribution-phase31-master.md#L430) | - Evidências visuais desktop/mobile. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-007` no controle. |
| D31-17-008 | 17 | [MASTER L431](distribution-phase31-master.md#L431) | - PDFs e documentos de homologação. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-008` no controle. |
| D31-17-009 | 17 | [MASTER L432](distribution-phase31-master.md#L432) | - Relatório de integridade de estoque e financeiro. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-009` no controle. |
| D31-17-010 | 17 | [MASTER L433](distribution-phase31-master.md#L433) | - Relatório de pendências fiscais e técnicas. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-010` no controle. |
| D31-17-011 | 17 | [MASTER L434](distribution-phase31-master.md#L434) | - Lista objetiva de requisitos para ativação comercial. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-011` no controle. |
| D31-17-012 | 17 | [MASTER L436](distribution-phase31-master.md#L436) | **Proibido:** | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-012` no controle. |
| D31-17-013 | 17 | [MASTER L438](distribution-phase31-master.md#L438) | - Fazer merge na `main`. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-013` no controle. |
| D31-17-014 | 17 | [MASTER L439](distribution-phase31-master.md#L439) | - Publicar em produção. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-014` no controle. |
| D31-17-015 | 17 | [MASTER L440](distribution-phase31-master.md#L440) | - Executar migrações em dados reais. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-015` no controle. |
| D31-17-016 | 17 | [MASTER L441](distribution-phase31-master.md#L441) | - Alterar qualquer empresa existente. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-016` no controle. |
| D31-17-017 | 17 | [MASTER L442](distribution-phase31-master.md#L442) | - Criar infraestrutura paga. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-017` no controle. |
| D31-17-018 | 17 | [MASTER L443](distribution-phase31-master.md#L443) | - Simular sucesso de emissão fiscal. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-018` no controle. |
| D31-17-019 | 17 | [MASTER L444](distribution-phase31-master.md#L444) | - Emitir documento eletrônico real sem credenciamento e autorização. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-019` no controle. |
| D31-17-020 | 17 | [MASTER L445](distribution-phase31-master.md#L445) | - Tratar emissão de Nota de Crédito como reembolso concluído. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-020` no controle. |
| D31-17-021 | 17 | [MASTER L446](distribution-phase31-master.md#L446) | - Recalcular movimentos históricos pela moeda padrão atual. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-021` no controle. |
| D31-17-022 | 17 | [MASTER L447](distribution-phase31-master.md#L447) | - Criar outro PDV, outro caixa, outro estoque ou outra contabilidade. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-022` no controle. |
| D31-17-023 | 17 | [MASTER L449](distribution-phase31-master.md#L449) | A comparação com regras oficiais instaladas, segurança do endpoint hospedado, integração definitiva com o Control Center, credenciamento dos provedores fiscais e homologação de impressora física continuam como critérios de liberação separados. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-023` no controle. |
| D31-17-024 | 17 | [MASTER L451](distribution-phase31-master.md#L451) | **REGRA FINAL:** quero um sistema multinacional completo e juridicamente configurável, no qual um motorista registre uma falta ou avaria e o ZenOS conduza a conferência, os documentos fiscais cabíveis e o acerto financeiro correto, sem lançamentos duplicados e sem comprometer qualquer empresa já existente. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-024` no controle. |
| D31-17-025 | 17 | [MASTER L453](distribution-phase31-master.md#L453) | Implementar efetivamente o escopo seguro em homologação. O que depender de confirmação legal, provedor fiscal ou autorização externa deverá ficar preparado, documentado e bloqueado para emissão real, nunca ser apresentado como funcionalidade homologada sem evidência. | Verificar integralmente esta unidade; arquivo, commit, teste e evidência em `D31-17-025` no controle. |

## Dependências e sequência de execução

A sequência abaixo organiza o trabalho, sem reduzir o escopo. Quando uma seção é citada, a dependência abrange todos os IDs com o respectivo prefixo `D31-SS-`.

| Ordem | Seções | Dependências e condição de avanço |
|---|---|---|
| 1 | 00, 01, 12, 14, 15, 17 | Auditar base e contratos existentes; preservar isolamento, autorizações e proibições desde o primeiro commit. Habilitação real e mudanças estruturais exigem autorização própria. |
| 2 | 02, 03, 04 | Fontes oficiais, vigência, jurisdição, estabelecimento e infraestrutura fiscal existente; incerteza mantém emissão real bloqueada. |
| 3 | 05, 08 | Modelo independente de estados (01), permissões (12), estoque V2 existente e rastreabilidade do fato. |
| 4 | 06, 07, 09, 10 | Ocorrência comprovada, reconciliação da venda original e confirmações fiscal, logística e financeira próprias; estoque, caixa e contratos existentes. |
| 5 | 11, 13 | Snapshots, auditoria e idempotência; documentos históricos e confirmação remota; resolução assistida sem compensação repetida. |
| 6 | 16, 17 | Testes são desenvolvidos junto a cada requisito; consolidação exige 20 cenários, regressões, evidências e relatório de integridade. |

Integração comercial (14), economia Firebase (15) e segurança (12) são transversais: não ficam adiadas até o final. Preparar contratos não equivale a ativar serviço real. As dependências não autorizam executar efeitos financeiros sem as confirmações próprias nem emitir documento fiscal real.

## Bloqueios independentes de liberação

Regras oficiais instaladas; segurança do endpoint hospedado; integração definitiva com o Control Center; credenciamento dos provedores fiscais; impressora física. Cada bloqueio exige evidência própria. Nenhum teste sintético ou protocolo fictício encerra esses bloqueios. Requisitos condicionados a confirmação externa devem registrar a dependência e permanecer bloqueados quanto à emissão/ativação real.

## Política de manutenção

Antes de qualquer alteração futura, ler os três documentos. Referenciar os IDs implementados no commit e atualizar a matriz e o controle no mesmo commit. Para CONCLUÍDO, registrar arquivos, SHA verificável, comandos/resultados e evidências; alegações de testes anteriores exigem verificação. Caso uma regra fiscal seja incerta, registrar BLOQUEADO para o efeito real, mesmo que a simulação esteja testada. Não substituir uma obrigação por um teste isolado ou protótipo. Melhorias futuras são adendos versionados.


## Registro de implementação inicial — Entrega A (não homologada)

A referência MASTER e os 259 IDs acima permanecem intactos. Ver [relatório técnico](distribution-phase31-implementation-a.md).

| Grupo de IDs (existência parcial) | Evidência de código | Estado | Lacuna para aceite |
|---|---|---|---|
| D31-01-001..006; D31-05-026..028 | `src/core/distribution/phase31Foundation.js` | EM TESTE | Integrar V2 e avaliar efeitos completos, inclusive proteção de compensações reais |
| D31-02-007; D31-02-010..011; D31-03-002; D31-03-017; D31-04-003..004; D31-04-007 | `src/core/distribution/phase31Foundation.js` | EM TESTE / emissão real BLOQUEADA | Validar elegibilidade fiscal, normas oficiais, provedores e autorizações reais |
| D31-05-003..013; D31-05-015..017; D31-05-021..023 | `src/core/distribution/phase31Foundation.js` | EM TESTE | Persistência real, conferência no banco, UI, dados/evidências complementares |
| D31-12-003; D31-12-006; D31-12-012..014 | `operational-functions/src/distribution/occurrences.js` | EM TESTE | Integrar ao backend existente com validação servidor de PIN, identidade e Firestore V2 |

Teste declarado no código: `scripts/distribution/phase31-foundation.test.mjs`. Foi realizada validação JS isolada com as limitações relatadas; **não houve execução comprovada de Node, Emulator ou navegador**. Nenhum grupo está CONCLUÍDO. Nenhum dos demais requisitos é removido, adiado definitivamente ou implicitamente aceito.


## Entrega A.2 — integração V2 e Central de Ocorrências (homologação parcial)

Evidência consolidada: [relatório A.2](distribution-phase31-a2.md) e [GitHub Actions aprovado no SHA 7aa47a2](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42318761946). Os **259 IDs originais mantêm suas unidades integrais e os respectivos critérios de aceite**; a tabela abaixo não os substitui.

| IDs relacionados | Código / teste concreto | Estado atual | Critério ainda pendente |
|---|---|---|---|
| D31-01-001..006 | `src/core/distribution/phase31Foundation.js`; `operational-functions/src/distribution/occurrenceService.js`; testes domínio/Emulator | EM TESTE | Integração integral dos efeitos fiscais e financeiros autorizados |
| D31-02-007; D31-02-010..011; D31-03-002; D31-03-017; D31-04-003..004; D31-04-007 | `phase31Foundation.js` e `occurrenceService.js` | EM TESTE; emissão real BLOQUEADA | Jurisdição, elegibilidade, protocolos oficiais, provedores e consentimentos |
| D31-05-001..028 | `DistributionOccurrences.jsx`, `DistributionCentral.jsx`, `occurrenceService.js`, `occurrences.test.mjs` | EM TESTE | Captura/evidências reais, links completos de viagem, deduplicação por fato e testes Chromium |
| D31-12-003; D31-12-006; D31-12-012..014 | `occurrences.js`, `occurrenceService.js`, integração Emulator | EM TESTE | Revisão de permissões finas e auditoria de segurança de implantação |
| D31-15-* | Carregamento React.lazy, consultas Hoje com paginação de até 30 | EM TESTE | Medir leituras e latência em cenário real de homologação |
| D31-16-* | 8 testes de domínio + 6 testes Firestore Emulator + build aprovado | EM TESTE | Completar 20 cenários MASTER, regressões e jornada visual desktop/mobile |

**Limite do aceite:** testes registrados em Actions estão aprovados no SHA `7aa47a2`, e não houve edição de código funcional após esse SHA antes do relatório; alterações posteriores restringiram gatilhos CI/documentação. Não houve execução Chromium, regras reais instaladas ou provedor fiscal autorizado. Não declarar CONCLUÍDO qualquer requisito agregado sem todas suas evidências.


## Entrega A.2 — evidência Chromium aprovada

**Execução oficial em CI:** [#42319497676](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42319497676), SHA `f0afb3e5cec26bc2ea242a87cc147ce08b144ce0`, **SUCCESS**. Resultado real: **10/10** Node (domínio+cliente), **6/6** transações Firestore Emulator, build React/Vite aprovado, fluxo Chromium **desktop 1440×1050 PT e mobile 390×844 ES**, integridade de estoque 100, livro financeiro sem lançamentos, rascunho fiscal `authorized:false`, `eligibilityVerified:false`. Artefato `distribution-phase31-a2-browser-evidence` no run #42319497676, id 13552571080. Ver detalhes em [relatório A.2](distribution-phase31-a2.md).

**Rastreabilidade adicional:** D31-05-001, D31-05-003..026, D31-01-001..006, D31-12-003/006/012..014 e D31-16-* tiveram **jornadas sintéticas relevantes testadas**. Não se declara nenhum ID agregado `CONCLUÍDO`: permanecem lacunas de evidências/fotos privadas, prevenção contra duplicidade semântica com chaves distintas, regras fiscais oficiais, perfis/escopos de todos os operadores, 20 cenários MASTER, e regressões ampliadas. O MASTER permanece imutável e os 259 IDs continuam preservados.

**Próxima ação:** revisão de deduplicação por evento físico e validação das provas/logísticas, regressões integrais Fases 2/2.1/3 e aceite de acessibilidade, sem abrir Entrega B ou produção.


## Entrega A.3 — proteção semântica e evidências privadas

**Escopo técnico:** ver [relatório A.3](distribution-phase31-a3.md). Os **259 itens da matriz original** e os critérios do MASTER permanecem intactos. Não foi realizado merge, deploy ou alteração em empresa real.

| IDs relacionados | Prova de implementação | Estado de aceite | Pendências |
|---|---|---|---|
| D31-01-001..006; D31-05-001..028 | `occurrenceFacts.js`, `occurrenceService.js`, `phase31Foundation.js`; testes de concorrência e prova logística | EM TESTE | Cobertura de todas as categorias de ocorrência, conflitos de fatos manuais legítimos e reconciliação final com B/C |
| D31-05-*; D31-12-003/006/012..014 | `privateEvidence.js`, `evidenceService.js`, `DistributionOccurrences.jsx`; upload privado e invalidação auditada | EM TESTE / PROD BLOQUEADA | Store privada exclusiva de Distribuição, retenção, expurgo e monitoramento de objetos órfãos em produção |
| D31-12-003/006/012..014 | `security.js`, `service.js`, `trips.js`, `occurrenceService.js`: permissão `distributionFiscalReview` e verificação por sessão | EM TESTE | Revisão integral dos papéis de todas as empresas e regras efetivas do Firestore |
| D31-15-* | Carregamento sob demanda, consultas por período e sem listeners extras | EM TESTE | Medição de latência e leituras reais em produção não autorizada |
| D31-16-* | `phase31-facts.test.mjs`, `occurrences.test.mjs`, `evidence.test.mjs`, testes Chromium; regressões 2/2.1/3 via GitHub Actions | EM TESTE | Registro da última execução abrangendo as alterações finais, critérios legais e homologação física |

**Evidências CI já aprovadas na branch:** [#42325684537](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42325684537), [#42325623192](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42325623192) e [#42325508316](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42325508316), com testes de domínio, Firebase Emulator, browser e regressões nos respectivos SHAs. A versão consolidada após os últimos ajustes deve apresentar evidência própria antes do aceite integral.

**Todos os estados fiscais transmitido/autorizado permanecem bloqueados.** Nenhum item dependente de A.3 ou de B/C/D/E foi fechado por aproximação; consultar detalhes em `docs/distribution-phase31-a3.md`.


## Homologação final da A.3 — GitHub Actions #42326100945

**Resultado verificado:** [execução GitHub Actions #42326100945](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42326100945) — **SUCCESS** no SHA de implementação `edf36d4eae4a95ee1a8bb30e31a18e193d55c42f`.

- **14/14 testes Node** dos contratos, cliente e fatos semânticos;
- **19/19 testes reais no Firebase Emulator**, incluindo prova da viagem, segurança por perfis, anexos privados, invalidação e divergência informativa sem consumo de quantidade física;
- **39/39 testes de regressão de domínio** das fases anteriores;
- **15/15 testes transacionais da Fase 3**;
- concorrência das Fases 2 e 3: etapas **SUCCESS**;
- `npm run build`: **SUCCESS**;
- navegador Chromium PT desktop 1440×1050 e ES mobile 390×844: **SUCCESS**;
- integridade V2: estoque sintético preservado, livro financeiro sem novos lançamentos, documento fiscal interno não autorizado, prova privada anexada e depois invalidada com auditoria;
- evidências (capturas, arquivo privado de teste e JSON de integridade) no artifact `distribution-phase31-a3-browser-evidence`, ID **13554903497**, dentro da execução vinculada acima.

A CI verifica o código até `edf36d4`. Após ele, somente foi acrescentada uma asserção de teste para família informativa, editada a política de CI para acionamento manual e produzida documentação — **nenhuma nova alteração operacional**. O arquivo MASTER permanece intocado. Não houve merge/deploy nem emissão fiscal.

**Limite do aceite:** a A.3 está homologada **para os fluxos sintéticos cobertos**, não para produção. A store de evidências é local e temporária do Emulator; pendem armazenamento privado de Distribuição em produção, regras/índices instalados, análise legal DNIT/SEFAZ, verificação de eventos manuais independentes, medição real de leituras, retenção/limpeza e aceite integral dos demais IDs da Fase 3.1.


## Fase 3.1 — Entrega B, implementação comercial

A fonte `docs/distribution-phase31-master.md` e seus **259 requisitos** permanecem imutáveis. Ver [relatório técnico B](distribution-phase31-b.md).

| Conjunto de IDs | Código e evidência | Estado | Bloqueio para aceite integral |
|---|---|---|---|
| D31-02-001..011; D31-03-001..017; D31-04-001..014 | `phase31Commercial.js`, `commercialService.js`; tipos candidatos por país, fonte fiscal preservada, emissão BLOQUEADA | EM TESTE / LEGAL_REVIEW_REQUIRED | Elegibilidade normativa vigente, protocolos de autorização DNIT/SEFAZ, validador fiscal por operação e UF/regime |
| D31-05-*; D31-06-* | `commercialService.js`, `commercial.test.mjs`: reservas por ocorrência e por linha de venda; origem e valor imutáveis | EM TESTE | Conciliação real de parcelas e comprovantes V2; ajustes financeiros não executados nesta fase |
| D31-10-*; D31-12-* | `DistributionCommercial.jsx`, transições com PIN/autorizações, representações históricas e impressão navegador PT/ES | EM TESTE | PDF persistido, aceite visual completo e assinatura/autorização externa |
| D31-15-*; D31-16-* | `phase31-commercial.test.mjs`, `commercial.test.mjs`, testes Chromium e regressões em CI | EM TESTE | Confirmar run definitivo e diferenças entre Emulator e produção |

**Não declarar CONCLUÍDO** nenhum grupo que dependa de credenciamento fiscal, subledger financeiro, storage privado, classificação tributária oficial, emissão de nota ou dinheiro movimentado. Nenhum evento de outbox aciona ZenOS Connect. Nenhum merge ou deploy.


## Entrega B — CI consolidada aprovada

**GitHub Actions:** [execução #42327714182](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42327714182), **SUCCESS**, código funcional testado no SHA `39576257c1e656ce40c2d4de06435503b3a18d60`. As alterações posteriores foram somente documentação e política do workflow (manual), sem modificar o código funcional.

Resultado real nos logs:

- **18/18** testes Node (contratos de fundação, ledger semântico, cliente, multimoeda e domínio comercial).
- **25/25** testes Firestore Emulator incluindo reservas por ocorrência e linha de venda, BR/PY, idempotência, permissões, preservação de vendas/estoque/financeiro e representações imutáveis.
- **43/43** regressões de domínio e **15/15** testes transacionais Fase 3.
- Etapas de concorrência Phase 2 e Phase 3: **SUCCESS**.
- Build React/Vite: **SUCCESS**.
- Chromium real desktop PT 1440×1050 e mobile ES 390×844: **SUCCESS**, incluindo criação do ajuste e espelho interno, ocorrências e evidências privadas.
- Verificação pós-navegador do Emulator: 1 ajuste com valor histórico **PYG 79.980**, reserva transacional e versão interna; zero lançamentos no livro financeiro, saldo e estoque sintéticos intactos e nenhuma autorização fiscal.
- Evidências: artifact `distribution-phase31-b-browser-evidence` ID **13556540282**, acessível na página do run acima; capturas `commercial-internal-pt.png`, `occurrences-desktop-pt.png`, `occurrences-mobile-es.png`, além de `browser-integrity.json` e `database-integrity.json`.

**Aceite:** implementação B **homologada para os cenários sintéticos efetivamente testados**, com bloqueios para emissão fiscal real e compensação financeira. Conciliação de parcelas efetivamente pagas, qualificação fiscal definitiva por UF/regime, parecer/consentimento SIFEN, PDF fiscal validado e revisão legal/contábil por empresa continuam **pendentes**. Nenhuma transação da Entrega C foi executada. O MASTER dos 259 IDs permanece intacto; nenhum ID agregado pode ser encerrado por presunção.


## Entrega B.1 — conciliação financeira de origem (homologação parcial)

[Relatório técnico B.1](distribution-phase31-b1.md). O MASTER original de **259 requisitos e 20 cenários permanece intacto**, sem fechamento agregado indevido.

| IDs afetados | Implementação verificável | Estado | O que impede aceite integral |
|---|---|---|---|
| D31-06-*; D31-07-*; D31-08-* | `phase31Reconciliation.js` lê origens V2 e separa confirmação do pagamento, dívida original e proposta financeira não executada | **EM TESTE** | Liquidações do fiado por parcela não vinculadas à venda, provas de liquidação externa e política comercial aprovada |
| D31-09-*; D31-10-* | Histórico de conciliação versionado, vínculo ao ajuste B, estado `STALE` após mudança das fontes | **EM TESTE** | Conciliação de estornos anteriores, conciliação fiscal válida e protocolos de terceiros |
| D31-12-*; D31-15-* | Servidor financeiro autenticado, recibos idempotentes, consulta limitada a 31 registros, painel sob demanda PT/ES | **EM TESTE** | Regra/índices instalados em produção, consultas extensas, medição faturável de leituras |
| D31-16-* | Testes `phase31-reconciliation.test.mjs`, `reconciliation.test.mjs`, CI Node/Firestore/Chromium | **EM TESTE** | Homologação final, 32 casos B.1, regressões completas e evidências por jurisdição |

**Importante:** livro `financeiro_livro` e venda `pagamentos` não possuem vínculo universal de parcela/pagamento liquidado. A B.1 trata lacunas como bloqueios; ela **não** baixa crédito, não cria restituição, não altera livro financeiro e não registra pagamento presumido. As evidências definitivas de CI serão vinculadas em adendo após validação final.


## Evidência de homologação B.1 — CI final aprovada

**GitHub Actions:** [execução #42329581878](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42329581878), **SUCCESS**; código funcional avaliado no commit `e5f88bcd06ecd3f2723c0244d291d4cc269c2b2a`. Commits posteriores alteram apenas a política de disparo do workflow e a documentação.

- **25/25** testes Node: fundação, cliente, ledger de ocorrências, contratos comerciais, conciliação conservadora, FIADO/FX e lançamentos extras sem atribuição.
- **30/30** testes reais Firebase Emulator: venda e comprovantes, alteração de origem `STALE`, idempotência, isolamento por empresa, operador financeiro, integridade do estoque, saldo cliente e livro financeiro.
- **50/50** testes de regressão de domínio das fases anteriores e **15/15** testes transacionais da Fase 3; etapas de concorrência antigas aprovadas.
- `npm run build`: **SUCCESS**.
- Chromium desktop e mobile: **SUCCESS**, incluindo o painel B.1 em português, estado de conciliação bloqueado sem fonte comprovada e indicação `STALE` após alterar o registro sintético de origem.
- [Artefato de evidências](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42329581878/artifacts/13556877310) `distribution-phase31-b1-browser-evidence`, ID **13556877310**: capturas, `reconciliation-browser-integrity.json`, `database-integrity.json` e relatórios Chromium.

**Limites expressos:** aprovação de testes sintéticos não prova liquidação bancária nem conciliação de contas a receber de clientes reais. O livro financeiro atual não impõe referência universal de parcela/pagamento e liquidação externa; essas fontes ficam pendentes sem inferência. Os **32 cenários de aceite da ordem B.1** não estão todos comprovados (especialmente parcelas reais, recebimentos multimoeda com câmbio histórico e reversões anteriores). Nenhum dos 259 requisitos do MASTER foi marcado automaticamente concluído. A Entrega C continua bloqueada; não houve merge, deploy, migração, estorno ou efeito em caixa/estoque.


## Entrega B.2 — vínculos financeiros explicitamente comprovados

[Relatório técnico B.2](distribution-phase31-b2.md). O MASTER original de **259 requisitos/20 cenários** está intacto. O resultado abaixo significa cobertura técnica parcial, não emissão/autorização financeira.

| Grupo | Prova técnica | Estado | Aceite ainda bloqueado |
|---|---|---|---|
| D31-06-* / D31-07-* / D31-08-* | `phase31FinancialLinks.js`: vínculo explícito venda-parcela-recebimento; 3 pagamentos parciais, saldo em minor units; estornos parciais por evento de origem | EM TESTE | Recebimentos legados sem `financeLinkVersion:2`, fluxo nativo de gravação de parcelas e divisão de pagamentos entre vendas |
| D31-09-* / D31-10-* | `reconciliationService.js`: hash da fonte, revisão e histórico `STALE`; `FinancialCompensationEligibilityV1` somente leitura | EM TESTE | Conciliação de créditos fiscais oficiais e execução financeira (Entrega C) |
| D31-12-* / D31-15-* | Servidor com PIN/permissão `finance`, segregação por tenant e consulta paginada por `referenciaId` até 300 eventos; nenhuma varredura global | EM TESTE | Índices de produção não instalados; eventos acima do limite bloqueados; métricas de faturamento Firestore não comprovadas |
| D31-16-* | `phase31-financial-links.test.mjs`, `financialLinks.test.mjs`, Chromium na branch, CI | EM TESTE | Validar run final com o código consolidado; nem todos os 42 casos da ordem B.2 têm evidência |

Não foi feita migração histórica, nenhuma baixa de parcelas, estorno, crédito financeiro, alteração no caixa, estoque ou PDV de produção. A liberação da preparação da Entrega C permanece **condicionada** à integração e homologação dos vínculos financeiros reais, sem concessão automática de autorização.


## Homologação consolidada B.2 — GitHub Actions #42331371202

**CI real:** [GitHub Actions #42331371202](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42331371202), **SUCCESS**, código executado no SHA `d78eee377180571bf1d332f67b8cd55cee6051cf`.

- **30/30** testes Node (domínio de ocorrências, contratos comerciais, cliente, conciliação B.1 e vínculos B.2).
- **34/34** testes reais no Firebase Auth/Firestore Emulator, incluindo três pagamentos parciais por parcela, alterações de origem com `STALE`, isolamento multitenant, idempotência e consulta paginada acima de 30 lançamentos.
- **55/55** regressões de domínio das fases anteriores e **15/15** testes transacionais da Fase 3. Etapas de concorrência das Fases 2 e 3: **SUCCESS**.
- Build Vite/React: **SUCCESS**.
- Chromium desktop PT e mobile ES: **SUCCESS**, incluindo conferência B.2 com saldo sintético PYG **90.000 recebidos / 109.950 em aberto**, visualização da parcela e contrato não executável, preservando histórico e caixa.
- Artefato [`distribution-phase31-b2-browser-evidence`](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42331371202/artifacts/13557966027), ID `13557966027`: screenshots e evidências `b2-partial-credit-integrity.json`, `reconciliation-browser-integrity.json`, `database-integrity.json`.

**Aceite técnico: PARCIAL / homologação sintética aprovada.** Os 42 cenários listados na ordem B.2 **não foram todos demonstrados**. Continua ausente a criação nativa obrigatória desses vínculos em todas as rotas reais de PDV/fiado; histórico legado ambíguo não pode ser atribuído, não há verificação independente de liquidação bancária, e pagamentos mistos entre várias vendas/parcelas ou renegociações ainda exigem cobertura adicional. A conciliação não deverá ser considerada pronta para execução real até sanar essas lacunas.

**Decisão da preparação da Entrega C:** NÃO LIBERADA INTEGRALMENTE, por falta dos comprovantes e contratos de origem para os fluxos de produção. O objeto `FinancialCompensationEligibilityV1` permanece `executable:false`; qualquer futura restituição exigirá revalidação das fontes atuais e autorização fiscal/financeira. O MASTER de 259 IDs permaneceu intocado. Nenhum merge, deploy, pagamento, baixa, restituição ou movimento de estoque foi executado.


## Fase 3.1 — Entrega B.3, vínculos nativos e gate objetivo para a C

[Relatório B.3](distribution-phase31-b3.md). O MASTER com **259 requisitos e 20 cenários** continua imutável. Esta matriz **não transforma** a implementação parcial em aceitação final.

| Requisitos relacionados | Evidência no código | Estado real | Bloqueio |
|---|---|---|---|
| D31-06-* / D31-07-* / D31-08-* | `phase31NativeFinanceLinks.js`, `PDV.jsx`, `Clientes.jsx`, `financialLedgerCore.js`; origem de fiado e seleção explícita da venda | PARCIAL | Falta criar/aprovar alocação obrigatória por parcela; recebimentos sem venda e históricos não têm vínculo comprovado |
| D31-09-* / D31-10-* | `reconciliationService.js` consulta livro `lojas/{tenant}/financeiro_livro` e venda V2, com dois índices lógicos por venda/recibo e paginação | PARCIAL | Sem comprovação de quitação bancária, saldos confiáveis de crédito multivenda e todas as reversões históricas |
| D31-12-* / D31-15-* | Link validado no mesmo lançamento financeiro V1/V2; preservação de valor contábil BRL, autenticação e consulta sob demanda | EM TESTE | Regras estritas de escrita client-side V2 **não homologadas** no cenário nativo B.3; não relaxar segurança |
| D31-16-* | `phase31-native-links.test.mjs`, `phase31-c-gates.test.mjs`, integração Emulator das fases anteriores e prova nativa separada | EM TESTE | Validar run final, 38 cenários completos e prova de transação cliente estrita |

**Decisão formal:** `PREPARATION_OF_C_ALLOWED=false`. Trava em `src/core/distribution/phase31CGates.js` exige G1–G10 em PASS com SHA e evidências; `EXECUTION_OF_C_ALLOWED` nunca é habilitada pela B.3. Nenhum merge, deploy, migração real, alteração de estoque, caixa ou restituição foi autorizado.


## Homologação consolidada B.3 — CI #42333625128

A execução [GitHub Actions #42333625128](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42333625128) terminou em **SUCCESS**, com SHA testado `2ec5060a1ce9bd8df7ad8d93e31cc1e772e19428`:

- **36/36** testes Node incluindo contratos nativos e a trava formal G1–G10;
- **34/34** testes Firestore/Auth Emulator (serviços de distribuição e conciliação);
- **61/61** testes de regressão de domínio e **15/15** testes transacionais da Fase 3;
- regressões de concorrência das Fases 2 e 3: **SUCCESS**;
- build React/Vite: **SUCCESS**;
- Chromium PT desktop e ES mobile: **SUCCESS**, incluindo cenário sintético de fiado parcial e integridade V2;
- artefato [`distribution-phase31-b3-browser-evidence`](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42333625128/artifacts/13558587344), ID `13558587344`, com imagens e JSONs de integridade.

**Diferença essencial de escopo:** esse workflow validou os contratos puros, a integração do servidor de conciliação e os fluxos Chromium já existentes. **Não executou o script separado `phase31-b3-native-v2-emulator.mjs`**; sua execução anterior falhou nas regras V2 estritas com `PERMISSION_DENIED` (evidências acima). As alterações posteriores a esse SHA incluem exclusivamente restauração das regras do Emulator à baseline e documentação. Nenhum PASS pode ser atribuído ao teste que foi excluído.

**Gate G9 = PARTIAL, G1 = PARTIAL, G4 = BLOCKED.** Os demais estão na matriz G1–G10 desta página. Em particular, faltam vínculos nativos por parcela e distribuição entre múltiplas vendas, reversões anteriores verificadas por transação, confirmação bancária independente e todos os 38 cenários da ordem B.3. A situação formal permanece `PREPARATION_OF_C_ALLOWED=false` e `EXECUTION_OF_C_ALLOWED=false`. Nenhum merge, deploy, migração em cliente real ou estorno.


## Entrega B.4 — prova V2, alocações verificáveis e origem de estornos

[Relatório detalhado B.4](distribution-phase31-b4.md). O MASTER original dos 259 IDs e 20 cenários permanece intacto; nenhuma categoria é fechada por simples criação de código.

| Escopo | Evidência direta | Status |
|---|---|---|
| G1 — cliente Firebase V2 | `phase31-b3-native-v2-emulator.mjs`, migração sintética de fixture com Admin SDK, operação de venda/recebimento com SDK cliente e regras V2 originais | EM TESTE, condicionado ao SHA de homologação consolidado |
| G2 — fiado/parcelas | `phase31CreditAllocation.js`, `PDV.jsx`, `Clientes.jsx`: alocações em centavos, um recibo para várias vendas, guarda remota por parcela e lançamento financeiro único | PARCIAL; calendário real de parcelas/legados e cenários multivenda nativos requerem evidências |
| G3 — câmbio histórico | moeda de recebimento e câmbio atribuído preservados; não há presunção de liquidação externa | PARCIAL |
| G4 — estornos anteriores | `phase31ReturnLineage.js`, `Vendas.jsx`: evento da própria devolução marcado `RETURN_RECORDED` e conferência das referências de venda/cliente/valor | PARCIAL; estornos legados e prova externa continuam bloqueados |
| G5/G6 — idempotência/isolamento | transação original V2, guardas de crédito, `operationKey`, regras do Emulator | EM TESTE |
| G7 — STALE | B.1/B.2 com fingerprint e revisão | PASS nos cenários anteriores; regressão B.4 pendente |
| G8 — integridade | operação original unifica histórico, cliente e livro; nenhum saldo/estoque real modificado na branch | EM TESTE |
| G9 — CI/Chromium | workflow B.4 obrigatório com prova nativa, testes Node/Firestore/React/Chromium | EM TESTE |
| G10 — documentação | relatório B.4 e rastreabilidade sem apagar o histórico | PASS |

**Decisão:** `PREPARATION_OF_C_ALLOWED=false` e `EXECUTION_OF_C_ALLOWED=false`. A B.4 não concede autorização financeira. Não houve merge, deploy, migração real, estorno real nem atualização de regras de produção.


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

> **CI integrada B.4 confirmada — 2026-11-07:** [#42420488604](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42420488604), SHA `b1c8b849754a24d58414c6a9737bb34861273c40`, SUCCESS. Regrediram positivamente testes 3.1, integração Emulator, Fases 2/2.1/3, transações/concorrência e Chromium desktop/mobile. Smoke G2/G4/G5 [#42420385476](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42420385476), SUCCESS. A aprovação de suítes **não encerra** os gates com evidências de negócio faltantes; G1–G6, G8–G9 PARTIAL, G7/G10 PASS histórico. Manter os 259 IDs e 20 cenários; C bloqueada.

> **B.4 G1/G6 — 2026-11-07:** duas identidades Firebase sintéticas no Emulator; cross-tenant leitura/escrita, acesso não autenticado e tentativas de falsificar geração/recibo/revisão V2 rejeitados. CI [#42421634177](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42421634177) SUCCESS no SHA `f6329d0e80cb37500b4c1ac8bfd4178d72eb5a2f`. Operadores delegados e matriz de papéis internos **ainda não foram provados**: G1/G6 PARTIAL. Novo caso G5 de replay divergente adicionado: revalidar CI no SHA do teste. G3/G4/G8/G9 pendentes. C bloqueada; 259 requisitos/20 cenários preservados.

> **B.4 G3/G5 — 2026-11-07:** caso G5 replay divergente no mesmo recibo provado com bloqueio em [CI #42421753550](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42421753550), SUCCESS SHA `86667824f41bfa668b10de4c9adac234dcf8c3b9`. G3: matriz de BRL/PYG/USD/EUR, FX documentado, falta de FX, falta de liquidação e pagamentos mistos testada em [CI #42421867393](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42421867393), SUCCESS SHA `d85345869c3bd23f6f3b9daa86a294df419eaf5b`. G3/G5 **PARTIAL** por integrações externas e concorrência abrangente; G1/G6 PARTIAL por perfis internos; demais lacunas preservadas, sem liberação de C.

> **B.4 2026-11-07 — evidências novas:** G6 operador/grants/PIN/sessão e G5 concorrência de devolução/estoque e G4 legados sem execução financeira: [CI focada #42422934473](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42422934473) SUCCESS, SHA `728189d2bacd4bc6e603e43088a60419a9b7236f`. Matriz de permissões e links: [evidence-matrix](distribution-phase31-b4-evidence-matrix.md). Rastreabilidade dos **20 cenários originais** `D31-16-002` a `D31-16-021`: [20-original-scenarios](distribution-phase31-b4-20-original-scenarios.md). Não se recuperou lista canônica dos **56 cenários adicionais**; portanto G8/G9 PARTIAL. CI integrada [#42423103191](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42423103191) validar resultado antes do aceite. C bloqueada; 259 IDs preservados.

> **CI G9 final desta execução — SUCCESS:** [#42423103191](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42423103191), SHA testado `aa8656f504c2de3335dc0e46e1ffe44f763eea16`. Todas as etapas integradas do workflow concluídas com sucesso (V2, domínio 3.1, Firebase, regressões 2/2.1/3, build e Chromium). Cenários individuais ainda parciais; **G9 PARTIAL** para gate de aceite total. G7/G10 PASS histórico; C continua bloqueada.

> **Revalidação B.4 em 2026-11-07.** Confirmados 259 IDs únicos neste checklist e preservada a [matriz dos 20 cenários originais](distribution-phase31-b4-20-original-scenarios.md), com 17 PARTIAL e 3 BLOCKED. A lista individual dos 56 adicionais segue pendente. Consulte a [decisão G1–G10](distribution-phase31-b4.md#revalidação-da-ordem-master--2026-11-07). Preparação e execução de C continuam bloqueadas.

> **G2/G4 e D31-16-004:** a etapa de venda parcialmente quitada com devolução interna passou na [CI #42425126667](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42425126667), SHA `2a12e269729c76344fbaaedeb9f6ffaeb68b1696`. O fluxo V2 mantém o recibo de R$ 250, sua alocação e o saldo de R$ 750. O cenário permanece PARTIAL até a jornada completa com conciliação e decisões aplicáveis. Os 259 IDs foram preservados.

# ZenOS Distribuição — Fase 3.1 / Entrega A.3

## Escopo e isolamento

Branch `feat/distribution-logistics-foundation`. Continuação da A.2, sem reconstrução de fases anteriores. O arquivo `docs/distribution-phase31-master.md` mantém **259 requisitos** e **20 cenários** intactos; este relatório descreve apenas o alcance de A.3 em homologação.

**Nenhum merge, deploy, empresa real, nota fiscal real, estorno financeiro ou alteração automática de estoque foi executado.** Todos os serviços operacionais adicionados neste ciclo continuam protegidos pela função `requireEmulators()`.

## Entregas implementadas

1. **Identidade do fato e limite acumulado transacional** — `operational-functions/src/distribution/occurrenceFacts.js` e `occurrenceService.js`. Identidade determinística derivada no servidor de empresa, estabelecimento, venda, linha e, quando disponível, viagem e comprovante de entrega. Ledger de reservas da ocorrência gravado na mesma transação Firestore V2 de evento, recibo e revisão. Uma segunda chave idempotente não abre silenciosamente a mesma ocorrência; continuação explícita por `continuationOf` exige gestor autorizado, respeita capacidade remanescente e mantém histórico. Descarte libera a quantidade sem apagar a ocorrência anterior.
2. **Prova logística** — vínculo de viagem/linha/parada e `proofId` ao evento `DELIVER` persistido, inclusive validação da geração V2; arquivo `phase31Foundation.js` conserva a referência de prova. Registro sem prova de viagem permanece em origem `MANUAL`, com confirmação reservada a gestor, e **não** é tratado como prova de entrega.
3. **Evidências privadas (somente homologação)** — `privateEvidence.js` armazena bytes exclusivamente no diretório privado de sistema operacional do emulador, fora do repositório, Vite e Firestore. `evidenceService.js` autoriza upload/leitura/invalidação pelo operador e empresa; valida MIME e assinatura real PNG/JPEG/PDF, limite 1 MB, SHA-256, metadados e histórico V2. O cliente recebe os bytes apenas via endpoint autenticado, sem link público. Invalidação por gestor bloqueia nova leitura, preserva metadados/evento e não altera estados fiscais ou financeiros.
4. **Permissões** — `security.js`, `service.js`, `trips.js` e `occurrenceService.js`: escopo separado `distributionFiscalReview` para revisão/rascunho fiscal, preservando `distributionManage` como gestor. Operadores com função apenas fiscal não podem registrar ocorrência logística nem anexar evidência sem autorização própria. Autorizações são verificadas a cada operação.
5. **Interface PT/ES** — `DistributionOccurrences.jsx/.css`: evidências privadas com upload, download e invalidação; mensagens de erros críticos; confirmação manual restrita a gestor; foco em janelas modais e teclado; componentes responsivos reaproveitam Central.
6. **Testes reais e regressões** — `operational-functions/test/distribution/occurrences.test.mjs`, `evidence.test.mjs`, `scripts/distribution/phase31-facts.test.mjs`, scripts Chromium de homologação, workflow `.github/workflows/distribution-phase31-a2.yml` ampliado para as fases 2/2.1/3.

## Segurança e limitações explícitas

- **Storage de produção NÃO habilitado.** A store privada de Commerce só permite namespace Commerce e **não** foi reutilizada. Antes de disponibilizar o recurso, será necessária store privada própria da Distribuição, contrato de credenciais, transporte autenticado, política de retenção/expurgo e tratamento de blobs órfãos. O filesystem temporário do Emulator **não é durável em produção**.
- **Foto/assinatura de entrega da Fase 3 NÃO foi migrada automaticamente.** Seus comprovantes históricos continuam imutáveis e associados a eventos logísticos. Novos anexos são evidências separadas na ocorrência.
- **Fatos manuais:** pela ausência de prova confiável, usa-se por segurança um único fato por venda/linha; uma segunda ocorrência exige continuação auditada por gestor. Isso pode exigir refinamento para novos acontecimentos legítimos sem viagem, com evidência independente autenticada. Não se autoriza criação irrestrita por descrição ou data.
- **Capacidade logística:** o evento de viagem utiliza `returning` quando o comprovante de entrega existe; fatos manuais usam o máximo físico/da linha como teto de proteção, exigindo conferência do gestor para confirmação. Ainda não substitui reconciliação integral de todas as classes de ocorrências/reembolsos das Entregas B/C.
- **Jurídico/fiscal:** rascunhos seguem `authorized:false`, `transmitted:false`, `eligibilityVerified:false`. Nem SIFEN nem SEFAZ real foi ativado. A referência fiscal histórica existente não substitui checagem de protocolo oficial.
- **Ativação comercial:** continua sujeita à revisão de regras Firestore, índices e permissões em produção, Control Center, integração com storage privado próprio, auditoria jurídica e homologação física. Nenhum destes bloqueios foi levantado.
- **Performance:** zero listeners globais novos, consulta sob demanda e paginação existente. Não foi medida a cobrança real de leituras; medições de emulador não devem ser apresentadas como leituras faturáveis.
- **Persistência:** não há autorização para migrar ou reescrever ocorrências de empresas reais. Eventuais dados anteriores à A.3 devem ser reconciliados antes de ativação futura.

## Aceite parcial e referências de teste

O fluxo A.3 exige evidência de testes Node, Firestore Emulator, Chromium desktop 1440×1050 e mobile 390×844 e regressões Fases 2/2.1/3. Os registros verificáveis devem ser consultados nos [GitHub Actions da branch](https://github.com/itamarpassos995-eng/ZenOS/actions) e na matriz vinculada. Falhas intermediárias de CI foram preservadas; não declaramos todo o escopo concluído apenas porque a compilação passou.

**Próximo passo:** obter e registrar o último CI com todas as etapas efetivamente verdes; corrigir qualquer regressão. A Entrega B continua NÃO INICIADA.

**IDs com evidência parcial relevante:** `D31-01-001..006`, `D31-02-007`, `D31-03-002`, `D31-04-003..004`, `D31-05-001..028`, `D31-12-003/006/012..014`, `D31-15-*` e `D31-16-*`. Nenhum ID é encerrado automaticamente.


## Evidências de homologação real

**GitHub Actions #42325929715 — SUCCESS** em [run verificável](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42325929715), SHA `51bddb56328730d7d524820e4b8deffa6ddd8d99`.

Resultados extraídos dos logs do job:

- **14/14 testes Node** de contratos, cliente e ledger semântico;
- **18/18 testes transacionais** no Firebase Emulator;
- **39/39 testes de regressão de domínio** das fases anteriores;
- **15/15 testes Phase 3** registrados no job de transações;
- execução de concorrência Phase 3 e Phase 2 concluída com sucesso;
- **build React/Vite concluído**;
- **jornada Chromium real desktop 1440×1050 (PT) e mobile 390×844 (ES)**, incluindo registro, revisão, rascunho fiscal interno, upload/download e invalidação de evidência privada, estado fiscal pendente, invariância de estoque e ausência de lançamento financeiro;
- [evidências browser A.3](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42325929715): artifact `distribution-phase31-a3-browser-evidence`, ID `13555705296`, com capturas e integridade.

Uma suíte posterior inclui a separação do fato físico e da divergência informativa (sem consumo de capacidade física), e seu resultado deve ser registrado separadamente; **não confundir CI aprovado em um commit com outro mais recente**.

Os dados de todos esses cenários são sintéticos do projeto `demo-zenos-local`. A aprovação no Emulator não autoriza implantação nem prova aderência fiscal oficial BR/PY.

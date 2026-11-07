# ZenOS Distribuição — Fase 3.1 / Entrega A.2

**Branch:** `feat/distribution-logistics-foundation`. **MASTER:** `docs/distribution-phase31-master.md` preservado e inalterado. Esta entrega abrange a integração inicial, **não o aceite de toda a Fase 3.1**.

## Código implementado

- `operational-functions/src/distribution/occurrenceService.js`: adaptador transacional Firestore V2; autenticação de operador em sessão/PIN já validada; autorização granular por escopo, validação de empresa, cliente, pedido, produto, linha e viagem/carga quando informadas; valores monetários reconstruídos a partir do snapshot de venda; comparação de revisões; recibos idempotentes; evento de auditoria e outbox LOCAL_ONLY; consultas limitadas por período e paginação (inclusive pedidos-fonte).
- `operational-functions/src/distribution/occurrences.js`: contratos existentes ajustados para receber principal e snapshots **validados dentro da transação**, sem usar autorizações do cliente.
- `operational-functions/src/distribution/service.js`, `server.js`: nova API `/occurrence-command` e `/occurrence-query` em servidor local/emulador; nenhuma rota de produção criada.
- `src/core/distribution/client.js`: chamadas autenticadas para operações e consultas de ocorrências.
- `src/components/DistributionOccurrences.jsx` e `.css`: área responsiva PT/ES, integrada por lazy-loading em `DistributionCentral.jsx`, com lista, filtro de motivo/estado, detalhes, registro por pedido/item e conferência; status independentes; rascunho fiscal interno quando a referência da venda estiver comprovada.
- `src/core/distribution/phase31Foundation.js`: snapshot de origem fiscal validada pelo host, preservando três estados independentes e rascunho sempre sem emissão/autorização.
- `operational-functions/test/distribution/occurrences.test.mjs`: testes transacionais V2 de persistência, idempotência, revisões concorrentes, escopo de operadores, isolação por empresa, limites de quantidade, BR/PY e ausência de efeitos no estoque/financeiro.
- `scripts/distribution/phase31-foundation.test.mjs`: atualizado para o contrato de principal verificado no host.
- `.github/workflows/distribution-phase31-a2.yml`: teste opt-in (acionamento manual após validação inicial) para não consumir minutos CI a cada commit.

## Evidência CI realmente executada

GitHub Actions `Distribution Phase 3.1 A.2 validation` — [execução bem-sucedida 42318761946](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42318761946), SHA `7aa47a2fe7db8e149637bd8abb843dad88482ccc`.

Resultados registrados: **8/8 testes de domínio/contrato**, **6/6 testes transacionais reais no Firebase Auth/Firestore Emulator** e **React/Vite build aprovado**. Execuções anteriores [42318644042](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42318644042), [42318736082](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42318736082) e [42318746478](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42318746478) também foram aprovadas em seus respectivos commits.

A CI aprovada contempla a implementação até `7aa47a2`. O HEAD posterior `3b0030d` alterou **somente a política de disparo da CI**, sem código funcional após `7aa47a2`.

## Restrições e riscos ainda não homologados

1. **Jornadas completas em navegador desktop (1440×1050) e mobile (390×844)** ainda não foram executadas por Playwright/Chromium para esta tela. Build não é evidência de experiência visual.
2. Registros de ocorrências possuem validação de quantidade por venda/linha e viagem quando vinculada, mas a **deduplicação semântica entre diferentes chaves de ocorrência do mesmo fato** ainda exige definição de identidade de evento logístico e teste específico. Recibo idempotente evita repetição da *mesma chave*, não a abertura de duas ocorrências diferentes para um único fato.
3. A origem fiscal reconhecida pelo backend usa a referência de uma fatura previamente registrada na venda e marcada como autorizada. **Não houve verificação independente de protocolo na DNIT/SEFAZ**; portanto, o rascunho permanece `eligibilityVerified:false`, `authorized:false` e `transmitted:false`.
4. A integração permanece **exclusiva do serviço de homologação local**; não há endpoint de produção, validação de regras instaladas nem habilitação comercial real.
5. Não foi criada persistência de foto/assinatura nesta etapa; evidências são referências opacas e necessitam de integração segura ao armazenamento privado antes de aceite completo.
6. A interface foi codificada em PT/ES e compilada, mas acessibilidade, filtros por estado combinados com paginação, estados de erro, fluxo completo de criação até consulta e reabertura, impressão e reimpressão requerem testes visuais e aceite.
7. Os testes amplos de regressão das Fases 2, 2.1 e 3 não foram repetidos nesta CI. A nova integração não escreve em estoque, `financeiro_livro`, `clientes` ou `vendas`, mas a ausência de mutações nestas seis jornadas não substitui homologação ampliada.
8. O país fiscal deve estar explicitamente configurado em `distribution_config/module.fiscalCountry` ou `issuer.country`; sem isso o comando bloqueia por padrão. Não há migração automática de empresas.
9. Alterações locais exclusivas do ambiente Work não são visíveis por esta integração GitHub e precisam de inspeção antes de qualquer sincronização com aquele ambiente.

## Rastreabilidade (parcial, sem fechamento indevido)

- `D31-01-001..006`: estados separados e fluxo de contrato **implementados e testados**, mas faltam caminhos reais de efeito fiscal/financeiro e aceite geral.
- `D31-02-007`, `D31-02-010..011`, `D31-03-002`, `D31-03-017`, `D31-04-003..004`, `D31-04-007`: tipos por jurisdição e bloqueios internos **implementados**; regras legais e emissão fiscal **BLOQUEADAS**.
- `D31-05-001..028`: central e origem transacional **parcialmente implementadas**; provas, deduplicação semântica, documentos e critérios finais ainda pendentes.
- `D31-12-003`, `D31-12-006`, `D31-12-012..014`: host com autorização existente, transação e recibos **testados**, mas permissões específicas e integração definitiva precisam de aceite.
- `D31-15-*`: lazy-loading, filtro Hoje e consultas paginadas presentes; medição real de leituras/latência ainda pendente.
- `D31-16-*`: seis testes de integração novos concluídos, mas os vinte cenários MASTER e jornada visual ainda não encerrados.

**Nenhuma linha do MASTER foi removida ou alterada.** Nenhum dos 259 IDs é declarado completamente concluído pelo presente relatório.

## Resultado e próxima validação

Esta etapa forneceu código real e testado para registro, leitura, conferência e rascunho fiscal interno **sem efeitos em estoque, caixa e financeiro**. O aceite integral da Entrega A.2 ainda depende de homologação visual e dos bloqueios acima.

Próxima ação controlada: testes Chromium desktop/mobile, verificação de reutilização do evento logístico para deduplicação, fotos/assinaturas privadas, permissão de operador de devoluções e regressões completas do módulo.

**Nenhum merge, deploy, emissão fiscal, migração ou acesso a dados reais nesta entrega.**


## Adendo — homologação Chromium concluída (execução de 7/11/2026)

**Execução comprovada:** [GitHub Actions #42319497676](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42319497676), **SUCCESS**, SHA `f0afb3e5cec26bc2ea242a87cc147ce08b144ce0`.

- **10/10** testes Node da fundação e cliente (incluindo recuperação de resposta perdida).
- **6/6** testes transacionais reais no Firebase Auth/Firestore Emulator.
- `npm run build` aprovado (Vite/React).
- Chromium desktop **1440×1050 PT**: login, abertura da Central, escolha de pedido, registro, conferência logística, rascunho interno de Nota de Crédito PY, estados independentes.
- Chromium mobile **390×844 ES**: consulta da ocorrência e documento pendente em espanhol.
- Integridade V2 após o fluxo: **estoque sintético 100**, nenhum lançamento no livro financeiro, uma ocorrência persistida, `authorized:false`, `eligibilityVerified:false`, estado financeiro `NOT_REQUESTED`.
- Evidências em [artifact distribution-phase31-a2-browser-evidence](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42319497676) (arquivo #13552571080): `occurrences-desktop-pt.png`, `occurrences-mobile-es.png`, `before-create-desktop.png`, `browser-integrity.json` e `database-integrity.json`.
- A primeira execução visual [#42319158812](https://github.com/itamarpassos995-eng/ZenOS/actions/runs/42319158812) falhou em um seletor Playwright excessivamente estrito; o seletor foi corrigido, com captura diagnóstica, e a segunda execução demonstrou a jornada completa.

O artefato registra dados **somente sintéticos**, nunca documento fiscal real. A validação Chromium resolve a pendência visual **do fluxo testado**, mas não fecha os 259 requisitos nem prova deduplicação semântica por evento físico, evidências privadas, integração fiscal oficial, permissões reais em produção, regressões amplas ou implantação. A emissão continua bloqueada.

**Observação de rastreabilidade:** a execução visual aprovada ocorreu no SHA `f0afb3e`, antes de mudanças documentais deste adendo; nenhum código operacional foi alterado após essa execução.

# Fase 3.1 — Entrega A: execução inicial e limitações

## Referência normativa
MASTER intocado: `docs/distribution-phase31-master.md` e seus 259 requisitos. Esta entrega não altera o MASTER nem considera os testes sintéticos equivalentes a uma homologação fiscal.

## Código acrescentado
- `src/core/distribution/phase31Foundation.js`: domínio puro de ocorrência, 11 motivos, referências da venda/pedido/cliente/produto, valor original por moeda, evidências referenciadas, três máquinas de estados independentes, histórico e rascunho fiscal bloqueado.
- `operational-functions/src/distribution/occurrences.js`: contrato de comandos CREATE, TRANSITION_LOGISTICS, TRANSITION_FISCAL, TRANSITION_FINANCIAL, DRAFT_FISCAL. Exige autorização resolvida pelo servidor, tenant e permissionamento, revisão esperada, recibo idempotente e outbox local, via adaptador transacional fornecido pelo host.
- `scripts/distribution/phase31-foundation.test.mjs`: testes para imutabilidade, moedas, integridade de referências, estados independentes, bloqueio de emissão, segregação BR/PY, revisão, repetição e tenant/permissões.

## Limitações deliberadas e bloqueios
- O contrato do host ainda **não está conectado** ao endpoint real do serviço, ao Firestore V2 ou à interface da Central. `transaction` e `authorize` são portas de integração obrigatórias, não mocks de produção.
- O adaptador SIFEN/SEFAZ ainda não suporta Nota de Crédito autorizada; os tipos BR/PY são **rótulos de contratos internos**, não XML, autorização, CFOP ou elegibilidade fiscal.
- Rascunho permanece `authorized:false`, `transmitted:false`, `eligibilityVerified:false`. Não há endpoint de autorizar, transmitir ou contabilizar.
- A validação do país, moeda, identificadores e revisão é local ao domínio. O host futuro deve confrontar referências contra vendas, fiscal e viagens V2 reais dentro da transação.
- A máquina de estados é conservadora; estados de aprovação fiscal/remuneração financeira real dependerão de integração fiscal, regras oficiais e comprovantes externos.
- Não implementado: conciliação financeira, dinheiro físico, cartões, crédito comercial, retorno ao estoque, impressões, offline reabertura, Control Center, interface premium e testes Firestore Emulator/browser.
- Alterações locais em outro ambiente Work não puderam ser inspecionadas. Nenhum arquivo existente de implementação foi sobrescrito.

## Validação
Uma validação isolada de JavaScript verificou transição REPORTED -> UNDER_REVIEW -> CONFIRMED, criação de rascunho fiscal PY bloqueado, ausência de alteração financeira e replay idempotente do contrato do host. Esse teste usou um shim JSON para `structuredClone` no interpretador V8 e **não equivale a executar `node --test`**.
O arquivo Node `scripts/distribution/phase31-foundation.test.mjs` foi criado, mas a execução Node/Emulator e CI ainda precisa ser comprovada; até lá, o estado é **EM TESTE**, não CONCLUÍDO.

## IDs de requisitos com implementação parcial verificável
`D31-01-001..006`, `D31-02-007`, `D31-02-010..011`, `D31-03-002`, `D31-03-017`,
`D31-04-003..004`, `D31-04-007`, `D31-05-003..013`, `D31-05-015..017`,
`D31-05-021..023`, `D31-05-026..028`, `D31-12-003`, `D31-12-006`, `D31-12-012..014`.

Esses IDs permanecem pendentes de aceite completo por se tratar somente da camada de contratos.

## Próximos passos
1. Executar testes Node no ambiente compatível, confirmar a ausência de regressões e salvar os logs.
2. Inspecionar e preservar eventuais alterações locais do Work.
3. Conectar o contrato a transações reais V2 + autorização/PIN existente; não aceitar principal passado pelo cliente.
4. Fazer um fluxo completo de ocorrência end-to-end com Firebase Emulator e interface PT/ES, mantendo rascunho fiscal bloqueado.
5. Versionar a matriz a cada integração, sem declarar nenhum dos 259 requisitos concluído por antecipação.

Sem merge, sem deploy, sem dados reais e sem emissão fiscal.

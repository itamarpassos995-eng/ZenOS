# ZenOS Control Center V1 — Fase 0: auditoria e arquitetura
Data: 2026-11-01. Escopo: leitura do código em main; nenhuma operação com dados de clientes.

## 1. Evidências verificadas
- `src/components/LandingPage.jsx`: registro usa Firebase Auth `createUserWithEmailAndPassword`; em seguida cria `lojas/{uid}` com `nomeLoja`, `emailAdmin`, `status:'aguardando_pagamento'` e `dataCriacao`. Login usa Firebase Auth. O botão/fluxo `demo` deste componente produz mensagem local; não é prova de registro durável de solicitação.
- `src/App.jsx`: `onAuthStateChanged` define `userId = user.uid`; lê `lojas/{uid}`. Quando `status === 'aguardando_pagamento'` e idade da conta <= 7 dias, trata como `ativo` em memória. Usuário sem registro de loja aciona criação de registro com status aguardando pagamento e acesso ativo em memória. Não mudar esse comportamento na primeira integração.
- `src/App.jsx`: `solicitarDemoFirebase` grava `solicitacoes_demo/{uid}` com status `pendente_analise`. Essa solicitação não é necessariamente o mesmo que o teste automático e não deve ser tratada como única origem de novos registros.
- `src/core/productionSync.js`: operações usam caminhos por `userId` e transações; livro financeiro é segregado por `lojas/{userId}/financeiro_livro`.
- `src/components/CommerceSolicitacao.jsx`: utiliza callable `commerceSolicitacaoCliente`; `functions/src/fiscalSolicitacaoCliente.js` valida Auth, resolve loja autorizada e registra interesse fiscal. Há canais de solicitações existentes a integrar sem consulta contínua às coleções operacionais.
- `src/core/storeProfile.js`: perfil local é indexado por usuário.
- Infraestrutura oficial: Vercel, projeto `zen-os`, repositório `itamarpassos995-eng/ZenOS`. Não confundir com serviços Render de outras aplicações.

## 2. Fluxo atual e limite de confiança
Cadastro navegador -> Firebase Auth -> documento `lojas/{uid}` -> login -> leitura da loja -> concessão em memória de teste até 7 dias para `aguardando_pagamento` -> dados operacionais por UID.
Observação P0: criação no Auth seguida de escrita na loja não é atomicamente indivisível; pode haver conta Auth sem documento se a segunda etapa falhar. O fluxo `demo` do LandingPage não prova persistência de pedido. A regra atual de teste parece depender do horário de criação informado no cliente e de avaliação no frontend; essa informação não deve ser tomada como autorização server-side segura para módulos pagos.
Não migrar, bloquear ou mudar cadastro existente sem testes e aprovação.

## 3. Arquitetura-alvo proposta
Novo aplicativo administrativo isolado em Vercel, com API server-side, PostgreSQL como fonte de verdade **comercial** e login administrativo independente com MFA. Banco operacional Firestore do ZenOS permanece intacto.
Entidades: organizações (externalAuthUid único); contatos; planos/versões de preço; módulos; assinatura; período de teste; itens contratados; cobrança; pagamento e eventos; solicitações; direitos/entitlements; administradores e papéis; auditoria append-only; outbox/inbox.
Dados financeiros em NUMERIC e moeda explícita; valores arredondados na precisão contratual. Sem leitura Firestore no dashboard administrativo.
Auth do cliente não confere direito de admin. Token do cliente só deve permitir solicitações da própria empresa, validado no servidor.
**Não ligar o sucesso do cadastro à disponibilidade da central:** integrar por evento durável produzido pelo backend/trigger de criação verificada, processado idempotentemente em PostgreSQL, com retry e reconciliação. Verificar se já existem triggers implantadas antes de escolher meio específico.
Assinaturas não devem bloquear transações financeiras em curso. Na V1, vencimento avisa, não bloqueia.

## 4. Eventos e contratos (proposta)
`organization.registered.v1`, `trial.started.v1`, `commercial.requested.v1`, `subscription.changed.v1`, `invoice.issued.v1`, `payment.confirmed.v1`.
Cada envelope: `eventId` único, `eventType`, `version`, `organizationUid`, `occurredAt`, `source`, `payload`. Entrega ao PostgreSQL com `UNIQUE(eventId)`; upsert por UID, outbox e reprocessamento; ordenação/versão por agregado. Não enviar dados operacionais nem segredos ao Control Center.

## 5. Schema inicial (proposta, não aplicado)
- `organizations(id UUID PK, firebase_uid TEXT UNIQUE, name, country, created_at)`
- `plans(id UUID PK, code UNIQUE, title)`
- `plan_prices(id UUID PK, plan_id FK, currency CHAR(3), amount NUMERIC(18,4), cadence, effective_from, effective_to)`
- `modules(id UUID PK, code UNIQUE, title)`
- `subscriptions(id UUID PK, organization_id FK, plan_id FK, status, starts_at, ends_at)`
- `trial_periods(id UUID PK, organization_id FK, starts_at, expires_at, source)`
- `entitlements(id UUID PK, organization_id FK, module_id FK, valid_from, valid_to, version)`
- `invoices(id UUID PK, organization_id FK, currency CHAR(3), total NUMERIC(18,4), due_at, status)`
- `payments(id UUID PK, invoice_id FK, currency CHAR(3), amount NUMERIC(18,4), provider_reference UNIQUE, status)`
- `commercial_requests(id UUID PK, organization_id FK, type, status, idempotency_key UNIQUE)`
- `admin_users`, `admin_roles`, `audit_events`, `inbox_events(event_id UNIQUE)`, `outbox_events`, `notifications`.
Refinar índices por `organization_id`, `status`, `due_at` e políticas de retenção. Nunca atribuir o mesmo e-mail como identidade de tenant.

## 6. Riscos e mitigação
- P0: atrasar teste por indisponibilidade Control Center -> nunca sincronizar bloqueando cadastro; fila durável.
- P0: entitlement falso por UI -> middleware server-side e MFA para administração.
- P0: disparos duplicados -> chaves idempotentes e UNIQUE no PostgreSQL.
- P0: identidade de empresa ambígua -> usar UID canônico mapeado e validação do token, sem associação pelo e-mail.
- P0: mudanças de assinatura interromperem PDV -> não ativar bloqueios na V1.
- P1: cadastro Auth sem loja -> conciliação e alerta, sem reescrita automática em produção.
- P1: fluxo demo meramente visual -> distinguir solicitação de demonstração e teste liberado.
- P1: erro de câmbio/cobrança -> moeda em cada transação, valores DECIMAL, histórico imutável.
- P1: custos/escala -> SQL paginado/índices e agregações por evento, sem listeners Firestore.

## 7. Fases de entrega e testes de aceitação
Fase 1: repositório/projeto isolado, auth MFA, Postgres, migrations, auditoria e testes de isolamento.
Fase 2: fluxo de eventos sem latência no cadastro; cenários backend indisponível, retry e duplicatas; preservar acesso imediato.
Fase 3: assinaturas, módulos e aprovações; sem bloqueio automático.
Fase 4: cobranças em BRL/PYG, webhook autenticado, idempotência e conciliação.
Fase 5: notificações, agregados e observabilidade.
Fase 6: integração de entitlements com testes operacionais e rollback.
Fase 7: ativação gradual mediante aprovação.
Aceite: cadastro funciona com central fora do ar; segunda entrega do mesmo evento não cria segunda empresa; tentativa de ler tenant diferente negada; cobrança só é paga por evento confiável; nenhum listener Firestore no Control Center; caixa e PDV sem alterações.

## 8. Custos e escolhas pendentes
Provedores candidatos: Vercel para front/API e PostgreSQL gerenciado. Não foi confirmado preço, quota nem capacidade contratada: obter tabelas oficiais e estimar para 10/100/1000/10000 organizações antes da escolha. Definir provedor de autenticação admin/MFA, filas, retenção, backup, e cobrança BR/PY posteriormente. Sem provisionamento pago nesta fase.

## 9. Restrições desta auditoria
Esta fase inspecionou caminhos críticos por leitura de código, **não** executou cadastro real, não enumerou clientes, não avaliou integralmente Firestore rules, deploy de Cloud Functions, triggers ou configuração de provedores. Esses pontos seguem obrigatórios antes de implementar integração em produção.

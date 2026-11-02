# ZenOS Control Center — Fundação isolada (Fase 1, em homologação)

**Não é código de produção.** Diretório independente, não importado pelo aplicativo Vite do ZenOS, sem deploy, sem integração com Firebase ou clientes reais.

## Escopo entregue
- Primeira migration PostgreSQL para organizações, planos, módulos, assinaturas, períodos de teste, solicitações, cobrança, pagamento, inbox/outbox e trilha administrativa.
- Invariantes de identidade por Firebase UID, unicidade de eventos, moeda explícita, valores exatos, isolamento por organização e auditoria.
- Contrato inicial de eventos de cadastro, sem requerer que a API administrativa esteja online durante o cadastro.

## Escopo NÃO implementado
- Nenhuma API conectada a produção, nenhuma autenticação administrativa, MFA, servidor Web ou interface.
- Nenhum banco PostgreSQL provisionado; nenhuma migration executada.
- Nenhuma alteração em cadastro, login, teste ou módulos do ZenOS.
- Sem sincronização real com Firebase, sem cobrança automática e sem bloqueios.

## Próximas etapas
1. Definir repositório autônomo do Control Center (sem permissão de criação de repositório nesta etapa, o esqueleto permanece em diretório isolado nesta branch).
2. Escolher fornecedor PostgreSQL e autenticação admin, com custos aprovados.
3. Implementar o serviço de ingestão server-side com autenticação, inbox idempotente, outbox durável, retries e reconciliação.
4. Implementar MFA/RBAC e testes automatizados completos em ambiente isolado.
5. Validar regras Firestore, triggers e cadastro real em emulador antes de integrar.
6. Separar em projeto Vercel próprio após aprovação. Nunca deploy de `zen-os` por esta branch.

## Regra irrevogável
A liberação do teste de novos clientes **permanece imediata e independente** da disponibilidade do Control Center. A central recebe o evento depois, nunca autoriza o início do teste.

# Auditoria técnica — Control Center (2026-11-03)

Escopo: leitura do código da branch `feat/control-center-google-mfa-base` e consulta do estado do deploy Render. Nenhuma consulta ao banco de produção, nenhuma escrita no Firebase e nenhuma publicação em produção.

## Evidência verificada
- Render deploy `7622826b` estava `live` na inspeção.
- PostgreSQL: migration `001_foundation.sql` define organizations, plans, modules, plan_prices, subscriptions, entitlements, invoices, payments, inbox_events, outbox_events, audit_events.
- Autenticação: Google OAuth + desafio TOTP + sessões persistidas no PostgreSQL; `verifySession` exige MFA habilitado.
- Interface: `control-center-ui.mjs` contém navegação premium; módulos Planos, Solicitações e Configurações ainda apresentam placeholder.
- Clientes: `postgres-repository.mjs` aplica LIMIT 1000; pesquisa em `auth-http.mjs` filtra array em memória, não usa paginação SQL.
- Controles: `organization-operations.mjs` registra `administrative_status`, `bonus_days`, `internal_note` e auditoria; não existe confirmação de aplicação pelo ZenOS.
- Sincronização: `organization-sync.mjs` executa script manual de varredura `lojas`; não há integração automática por evento demonstrada.
- Mapa de dados do ZenOS principal (`docs/ZENOS_DATA_MAP_V1.md` na main): identifica `lojas/{uid}` como metadados e `lojas/{uid}/dados/operacao` como documento operacional. Essa documentação é estática e requer confirmação com o fluxo de autenticação atual antes de integrar bloqueios.

## Classificação
| Área | Estado |
|---|---|
| Infraestrutura Render / PostgreSQL | EXISTENTE E FUNCIONAL para a homologação observada |
| OAuth / MFA | EXISTENTE E FUNCIONAL no código e no acesso anterior; requer regressão automatizada |
| Importação inicial | EXISTENTE E FUNCIONAL conforme validação manual do usuário |
| Sincronização incremental | AUSENTE |
| Paginação de clientes | COM DEFEITO (LIMIT 1000) |
| Interface premium | EXISTENTE E FUNCIONAL, gestão ainda rudimentar |
| Suspensão efetiva | AUSENTE; há somente status interno |
| Bonificação efetiva | AUSENTE; há somente contador interno |
| Planos e módulos | EXISTENTE MAS INCOMPLETA (schema sem fluxo operacional) |
| Mensalidades e pagamentos | EXISTENTE MAS INCOMPLETA (schema sem fluxo operacional) |
| Relatórios | EXISTENTE MAS INCOMPLETA |
| Auditoria | EXISTENTE MAS INCOMPLETA (registra operações internas, não confirmação externa) |

## Decisões arquiteturais obrigatórias
1. Separar estado solicitado, em processamento, aplicado e falho. Só um ACK do adaptador ZenOS pode marcar `applied`.
2. Reutilizar `inbox_events` e `outbox_events` após revisão dos contratos e índices. Não construir segundo barramento sem justificativa.
3. Não aplicar comandos reais ao Firebase antes de localizar e testar o ponto de autorização do ZenOS principal.
4. Substituir LIMIT 1000 por paginação SQL com cursor e busca parametrizada.
5. Criar migrations versionadas para estados efetivos, idempotência, revisão e auditoria antes de habilitar escrita operacional.
6. Manter toda gestão dentro de `/clientes` e demais seções existentes, sem páginas paralelas.
7. Não mesclar este branch de domínio até executar testes e validar integração com o contrato de autorização.

## Primeiro incremento isolado
`src/domain/license-command.mjs`: valida comandos por empresa, motivo e chave de idempotência; separa estados de entrega e modela resolução de acesso.
`test/license-command.test.mjs`: testes de transições, idempotência, bônus e precedência de suspensão.

**Limitação:** este incremento é somente domínio e testes de unidade. Não implementa bloqueio real, pagamentos, deploy ou sincronização automática.

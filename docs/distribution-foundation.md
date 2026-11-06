# Distribuição & Logística — implementação inicial

Data: 06/11/2026. Base auditada: ac808e35db4aaa3ed4447a49f7d51de9de06f6fc (main).
Branch: feat/distribution-logistics-foundation.
A autorização explícita de execução de 06/11 substitui a proibição de implementação do MASTER anexado; produção, merge e migrações reais continuam proibidos.

## Código entregue

- `src/core/distribution/domain.js`: contratos v1 e máquinas independentes de pedido, separação, carga, entrega e acerto; quantias inteiras em strings por moeda, precisão validada e totais sem conversão; consolidação de linhas de pedidos/vendedores; snapshots imutáveis de romaneios, versionamento e recuperação histórica.
- `src/core/distribution/commands.js`: executor de comandos com autorização obrigatória por adaptador confiável, revisão otimista, recibos idempotentes e contrato de gravação atômica de carga/recibo/evento de outbox.
- `scripts/distribution/domain.test.mjs`: massa exclusivamente sintética e testes executáveis com Node, sem conexão a banco.

O executor é uma biblioteca para o futuro backend. Não é um endpoint disponível. Seu contrato exige que o host valide identidade/operador/habilitação e execute uma transação real. A implementação atual de teste é serializada em memória. Não equivale a comprovação de concorrência no Firestore.

Romaneio nesta etapa é o documento estruturado, com snapshots e versões; PDF, impressão, QR autenticado, tela e reimpressão visual ainda não foram implementados. `amount` na linha é o total autorizado da alocação, não preço unitário; o futuro adaptador precisa calculá-lo do pedido confiável. Quantidades nesta etapa são inteiras na unidade base; embalagens fracionárias dependem de contrato explícito.

## Auditoria e reaproveitamento

| Área | Evidência no repositório | Decisão / lacuna |
|---|---|---|
| PDV e pedidos | src/components/PDV.jsx; api/commerce/pedido.js e inbox.js | Manter fluxo atual; integrar por referência estável e snapshot do pedido. Nenhuma segunda venda criada. |
| Persistência V2 | src/core/operationalV2.js; operational-functions/src/nativeV2.js | Reutilizar geração, revisões e recibos existentes; não escrever coleções logísticas reais antes de definir atomicidade com V2. |
| Estoque | src/core/inventory.js | Estoque canônico, vitrine/galpão e política de negativo existentes. Falta reserva transacional no servidor e localização móvel. Expedição pelo executor bloqueada até adaptador certificado. |
| Clientes/produtos/vendedores | nativeV2.js: clientes/produtos/operadores | Referências aos cadastros existentes; nenhum cadastro paralelo. Não há importação automática nesta entrega. |
| Moedas | src/core/productMoney.js; docs/native-product-money.md | Preservar moeda de origem e snapshots. Novo contrato exato requer adaptador explícito do legado; não reinterpretar campos BRL. |
| Financeiro | src/core/financialLedgerCore.js | Reutilizar lançamentos atuais, sem recebimentos neste núcleo; auditar ponte de precisão antes de acertos. |
| Identidade/permissões | src/core/accessControl.js; functions/src/fiscalAuthorization.js | Gerência/PIN operacional atual e autenticação de loja não bastam para provar identidade do operador ao backend logístico. Endpoint fica ausente até solução confiável. |
| Cache/leituras | src/firebase.js; docs/daily-finance-fast-start.md | Preservar cache multitab, checkpoint e carregamento sob demanda. Nenhum import do módulo em App/main; zero chamadas Firebase no código novo. Medição remota ainda pendente. |
| Idiomas | src/core/useUiLanguage.js; uiLanguage.js | Reutilizar infraestrutura central na futura tela PT/ES; domínio retorna códigos, sem mensagens de UI. |
| Jobs/eventos | functions/src; api/commerce | Contrato de outbox entregue, sem consumidor/worker ativo. Nenhuma mensagem B2B real. |
| Control Center | diretório control-center ausente nesta main | Não reconstruir. Confirmar versão/serviço existente e seu contrato de entitlement antes de ativar módulo. |

## Contrato de comandos e segurança

Entrada v1: tenantId, loadId, key, expectedRevision, type, payload.
Tipos: REPLACE_LINES, TRANSITION_LOAD e ISSUE_MANIFEST.
Permissões: distribution.load.edit, distribution.load.transition, distribution.manifest.issue.
A autorização deve ser resolvida pelo servidor e repetida antes de qualquer replay. Permissões enviadas pelo navegador não são confiáveis.
O adaptador transacional deve fazer leituras antes de gravações e confirmar atomicamente documento, recibo e evento. Se a transação falhar, nenhum efeito deve sobreviver. Recibo é escopado por empresa/carga/chave e vinculado ao operador e conteúdo original.
Evento interno: distribution.load.changed.v1, com ID determinístico, tenantId, entityId, revision, correlationId. Não é autorização para publicar dados no Connect. Inbox/outbox persistentes, destinatários e escopos Connect ainda pendentes.
Máquinas excepcionais são conservadoras; compensações de estoque/financeiro não são liberadas por transição simples.

## Validação e rastreabilidade

Comando: `node --test scripts/distribution/*.test.mjs`.
13 testes aprovados: dinheiro exato; consolidação entre vendedores; isolamento de tenant; validação quantitativa; estados; snapshot histórico/versionamento; replay; conflito de revisão; reutilização indevida de chave; revogação de acesso; bloqueio de expedição sem integração; emissão idempotente.
T02, T06, T08, T19/T21/T22, T29/T30, T31/T34/T35 e T40 possuem cobertura PARCIAL de domínio/contrato. Nenhum desses cenários está declarado homologado ponta a ponta. Reserva concorrente T17, caixa T37, rede/offline, QR T44 e performance T45–T52 continuam pendentes.

## Próxima entrega e recuperação

1. Identidade do operador e habilitação comercial verificadas no servidor.
2. Adaptador transacional de pedidos/reservas integrado ao estoque V2, com emulador demo e concorrência real.
3. Central de Distribuição sob demanda, Hoje como padrão, paginação por cursor e PT/ES.
4. Impressão A4 e histórico de romaneios sobre snapshots persistidos.

Nenhuma migração foi executada ou é necessária para esta biblioteca inativa. Rollback: descartar a branch; não existem dados externos criados para compensar. Migrações futuras exigem versão, reversão e homologação próprias. Sem dependências novas ou infraestrutura paga.

Verificações adicionais executadas: 9 testes existentes de cartões multimoeda e moeda de exibição no fechamento aprovados; `npm run build` aprovado (181 módulos; aviso de chunk Firebase acima de 500 kB). `git diff --check` aprovado. Dependências instaladas com scripts de instalação desativados. Nenhum comando Firebase, migração, acesso a dados de clientes ou deploy executado. Workflow novo apenas valida domínio em pull requests ou disparo manual; não contém publicação.

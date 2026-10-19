# Incidente P0 — Integridade de operações do ZenOS (2026-10-19)

## Evidências e limites do diagnóstico
Relato de cliente: vendas e pré-pedidos desaparecem da interface, produtos não aparecem mas ficam bloqueados por "já existe"; PDV informou "Venda não concluída", "nuvem não confirmou", com erro Web SDK "Failed to get documents from server ... local cache". **Ainda não há diagnóstico de perda física de um documento**; falta ler servidor da loja afetada e trilha de operações com autorização explícita. NÃO reprocessar pagamentos/vendas às cegas.

Leitura estática em `main` (3cfecd9):
- `operationalRepository.js` utiliza `getDocFromServer` / `getDocsFromServer` para V1/V2, e `V2Session.fail()` interrompe a assinatura após erro. Sem lógica própria de retry de leitura. `onSnapshot` com erro desativa `nuvemSincronizada` no App; ausência de reconexão exige atendimento.
- `src/App.jsx:211+`: em commit reativo sem confirmação, o estado local é revertido ao último `baseValue`. Dados que o operador acabou de digitar deixam de aparecer; não se pode chamar essa alteração de "gravada".
- `Produtos.jsx:128+` e `PDV.jsx:206+`: `reservarIdentidadeProduto` grava `produto_indices` em transação separada antes de commit de `produtos`. Uma falha de rede/crash entre etapas pode deixar índice órfão; uma reversão sem prova remota também pode remover índice de produto efetivamente criado.
- `productionSync.js` V1 guarda chaves recentes para deduplicação (somente 120); `operationalV2.js` V2 registra receipt com hash. A UI de venda ainda afirma "nada foi finalizado" quando a transação não foi confirmada para o cliente; não é prova de falha no servidor.
- `MAX_WRITES_GLOBAL_PER_WINDOW=30` em cliente + limite de V1 ~930 KiB. Crescimento deve abandonar arrays quentes em documentos e efeitos reativos de gravação; migração de provedor sozinha **não** resolve esse desenho.
- Teste Vercel runtime logs retorna 403 para o projeto; o erro Firestore no navegador não seria necessariamente mostrado em logs de uma aplicação frontend estática.

## Correção nesta PR (somente leitura, sem deploy automático)
`authoritativeFirestoreRead`: até 2 tentativas adicionais em falhas genuinamente transitórias em V1/V2, com intervalo curto e orçamento limitado; NÃO usa cache como confirmação. Não faz retry em `permission-denied`, `resource-exhausted`, `failed-precondition` ou dados inválidos. Não muda transações, regras, modelo de dados, documento V1 nem índices. Caso o servidor permaneça indisponível, a UI deve bloquear novas gravações, nunca inventar sucesso.

**Este PR não corrige sozinho índices órfãos, resiliência offline, perdas anteriores nem confirmação desconhecida de venda.** Não anunciar solução completa com apenas esse patch.

## P0 — antes de qualquer nova alteração em produção
1. Coletar do cliente **sem credenciais**: horário com fuso, tela, nome/SKU ou ID de produto, identificador do pré-pedido, terminal e status da rede. Não pedir PIN.
2. Backup/exportação do Firestore da loja afetada; capturar checksums e versões dos documentos V1/V2 **sem alterar nenhum registro**.
3. Consultas somente leitura no servidor, por loja autenticada: `dados/operacao` (V1), `dados/storage_control`, geração V2 / `operations` receipts, `produto_indices`, `financeiro_livro`, `estoque_auditoria`; comparar IDs e timestamps sem expor dados entre clientes. Distinguir (a) persiste mas não aparece; (b) não persiste; (c) índice órfão; (d) duplicidade real; (e) status de transação desconhecido.
4. Não apagar índices, vendas, pré-pedidos ou documentos históricos. **Não redigitar venda com pagamento suspeito até confirmar pelo servidor/caixa.**
5. Só avançar feature flag de correção após emulador e piloto com dados fictícios, aprovação e rollback.

## P0 estrutural (PRs separados e testes de falha obrigatórios)
- **Comandos financeiros idempotentes e duráveis:** servidor confirma operação por loja+ID único estável, receipt com status `pending/committed/rejected/unknown`, consulta do comprovante após timeout, reenvio seguro do MESMO ID após reconexão; nenhum `create new id` no retry; ledger e estoque na mesma transação lógica.
- **Rascunho recuperável e fila de intenção local segura:** vendedor vê "a confirmar", preserva carrinho e campos digitados, sem misturar dado de outras lojas; jamais despachar venda/pagamento automaticamente após reconexão sem reconciliar receipt.
- **Cadastro atômico com índice:** SKU/assinatura e produto devem ser transacionados conjuntamente na mesma unidade de escrita, ou por reserva temporária vinculada a operationId com expiração/reconciliador; nunca excluir reserva sem conferir propriedade e cadastro confirmado no servidor.
- **Leitura e sincronização com estado consistente:** V1/V2 fail-closed para commits, recuperação automática de listeners por erro transitório, interface não mostra lista vazia como se o catálogo fosse vazio enquanto o servidor está inacessível. V1 legado preservado, V2 por loja/certificado, sem migração destrutiva.
- **Saúde observável:** alertas de `readsUnavailable`, `writesUnknown`, `indexOrphans`, tamanho V1, sequência V2, retries e tempo de fechamento; zero PII, alertar antes que cliente reporte.
- **Capacidade:** analisar Firestore read/write, sessões simultâneas, tamanho do V1, offline/reconexão, quotas, conflitos e latência; decidir possível backend dedicado. AWS é opção só após provar gargalo ou requisito não atendido pelo Firebase.

## Gates
- Falhas simuladas após COMMIT servidor e antes do ACK, antes do COMMIT e durante leitura paginada (incluindo 2 caixas simultâneos, login de lojas distintas, latência, offline, quota e reconexão).
- Zero duplicação em venda/financeiro/estoque, zero desaparecimento definitivo de pré-pedido, zero exclusão de índice de produto válido, zero sobrescrita de V1 por fallback, nenhuma venda considerada concluída com status desconhecido.
- Teste ponta-a-ponta PDV > pré-pedido > pagamento > histórico > devolução > fiado > fechamento de caixa, login multioperador e consumo real.
- Publicar primeiro em HML isolada. Testes de smoke em produção somente após autorização do proprietário, monitoramento e plano de rollback que não restaura banco inteiro.

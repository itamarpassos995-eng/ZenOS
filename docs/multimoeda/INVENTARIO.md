# Inventário monetário — triagem de consumidores

Base inspecionada: `db8b32d00b2b4f662d601a05efcb3da8f166c9ae`.

Busca estática: ponto de partida para revisão semântica, sem garantia de encontrar todos os valores monetários. Nenhum item abaixo está homologado pelo simples fato de aparecer nesta lista.

| Arquivo | Área | Linhas sinalizadas | Estado |
|---|---|---:|---|
| [api/commerce/inbox.js](../../api/commerce/inbox.js) | Commerce | 4 | Integração pendente |
| [api/commerce/pedido.js](../../api/commerce/pedido.js) | Commerce | 3 | Integração pendente |
| [src/App.jsx](../../src/App.jsx) | Orquestração, importação e IA | 141 | Integração pendente |
| [src/components/AssistenteZen.jsx](../../src/components/AssistenteZen.jsx) | Outros consumidores | 7 | Integração pendente |
| [src/components/Clientes.jsx](../../src/components/Clientes.jsx) | Clientes e fiado | 52 | Integração pendente |
| [src/components/Comissoes.jsx](../../src/components/Comissoes.jsx) | Comissões, metas e bônus | 2 | Integração pendente |
| [src/components/CommerceOrderInbox.jsx](../../src/components/CommerceOrderInbox.jsx) | Commerce | 2 | Integração pendente |
| [src/components/CommerceSolicitacao.jsx](../../src/components/CommerceSolicitacao.jsx) | Commerce | 20 | Integração pendente |
| [src/components/DashboardMobile.jsx](../../src/components/DashboardMobile.jsx) | Relatórios e resultado | 3 | Integração pendente |
| [src/components/Despesas.jsx](../../src/components/Despesas.jsx) | Despesas e recorrências | 14 | Integração pendente |
| [src/components/EstoqueInteligente.jsx](../../src/components/EstoqueInteligente.jsx) | Outros consumidores | 5 | Integração pendente |
| [src/components/Fiscal.jsx](../../src/components/Fiscal.jsx) | Fiscal | 9 | Integração pendente |
| [src/components/GestaoCaixas.jsx](../../src/components/GestaoCaixas.jsx) | Caixa e conciliação | 18 | Integração pendente |
| [src/components/ImportacaoVipe.jsx](../../src/components/ImportacaoVipe.jsx) | Outros consumidores | 6 | Integração pendente |
| [src/components/Mesas.jsx](../../src/components/Mesas.jsx) | Outros consumidores | 9 | Integração pendente |
| [src/components/Migracao.jsx](../../src/components/Migracao.jsx) | Orquestração, importação e IA | 3 | Integração pendente |
| [src/components/PDV.jsx](../../src/components/PDV.jsx) | Vendas e PDV | 153 | Integração pendente |
| [src/components/PDVCompras.jsx](../../src/components/PDVCompras.jsx) | Compras, estoque e custos | 84 | Integração pendente |
| [src/components/Produtos.jsx](../../src/components/Produtos.jsx) | Catálogo e preços | 25 | Integração pendente |
| [src/components/Vendas.jsx](../../src/components/Vendas.jsx) | Vendas e PDV | 60 | Integração pendente |
| [src/components/ZenAssistenteIA.jsx](../../src/components/ZenAssistenteIA.jsx) | Orquestração, importação e IA | 93 | Integração pendente |
| [src/components/ZenCommerceStorefront.jsx](../../src/components/ZenCommerceStorefront.jsx) | Commerce | 8 | Integração pendente |
| [src/components/ZenVisualLayout.jsx](../../src/components/ZenVisualLayout.jsx) | Orquestração, importação e IA | 2 | Integração pendente |
| [src/core/backupCore.js](../../src/core/backupCore.js) | Outros consumidores | 1 | Integração pendente |
| [src/core/cashHistoryDisplay.js](../../src/core/cashHistoryDisplay.js) | Caixa e conciliação | 4 | Integração pendente |
| [src/core/cashMoneyInput.js](../../src/core/cashMoneyInput.js) | Caixa e conciliação | 6 | Integração pendente |
| [src/core/cashMovementReadOnly.js](../../src/core/cashMovementReadOnly.js) | Caixa e conciliação | 2 | Integração pendente |
| [src/core/cashReconciliation.js](../../src/core/cashReconciliation.js) | Caixa e conciliação | 21 | Integração pendente |
| [src/core/cashSession.js](../../src/core/cashSession.js) | Caixa e conciliação | 15 | Integração pendente |
| [src/core/clientCreditLinkAudit.js](../../src/core/clientCreditLinkAudit.js) | Outros consumidores | 2 | Integração pendente |
| [src/core/commerceCdnClient.js](../../src/core/commerceCdnClient.js) | Commerce | 1 | Integração pendente |
| [src/core/commercePublicCatalog.js](../../src/core/commercePublicCatalog.js) | Commerce | 4 | Integração pendente |
| [src/core/commissionEngine.js](../../src/core/commissionEngine.js) | Comissões, metas e bônus | 7 | Integração pendente |
| [src/core/commissions.js](../../src/core/commissions.js) | Comissões, metas e bônus | 6 | Integração pendente |
| [src/core/creditReconciliation.js](../../src/core/creditReconciliation.js) | Clientes e fiado | 4 | Integração pendente |
| [src/core/expensePaymentReconcile.js](../../src/core/expensePaymentReconcile.js) | Despesas e recorrências | 2 | Integração pendente |
| [src/core/expenseResult.js](../../src/core/expenseResult.js) | Despesas e recorrências | 1 | Integração pendente |
| [src/core/financialAudit.js](../../src/core/financialAudit.js) | Relatórios e resultado | 10 | Integração pendente |
| [src/core/financialLedgerCore.js](../../src/core/financialLedgerCore.js) | Persistência e livro | 2 | Integração pendente |
| [src/core/fiscalCore.js](../../src/core/fiscalCore.js) | Fiscal | 18 | Integração pendente |
| [src/core/operationalV2.js](../../src/core/operationalV2.js) | Persistência e livro | 1 | Integração pendente |
| [src/core/paymentValidation.js](../../src/core/paymentValidation.js) | Outros consumidores | 4 | Integração pendente |
| [src/core/productRecoveryCore.js](../../src/core/productRecoveryCore.js) | Catálogo e preços | 1 | Integração pendente |
| [src/core/productionSync.js](../../src/core/productionSync.js) | Catálogo e preços | 9 | Integração pendente |
| [src/core/purchaseCosts.js](../../src/core/purchaseCosts.js) | Compras, estoque e custos | 22 | Integração pendente |
| [src/core/receiptCurrency.js](../../src/core/receiptCurrency.js) | Recibos, PDFs e compartilhamento | 8 | Integração pendente |
| [src/core/salesFinancials.js](../../src/core/salesFinancials.js) | Relatórios e resultado | 28 | Integração pendente |
| [src/core/syncMerge.js](../../src/core/syncMerge.js) | Persistência e livro | 17 | Integração pendente |
| [src/core/v2TransactionPilot.js](../../src/core/v2TransactionPilot.js) | Outros consumidores | 2 | Integração pendente |
| [src/core/zenReceiptPdf.js](../../src/core/zenReceiptPdf.js) | Recibos, PDFs e compartilhamento | 9 | Integração pendente |
| [src/core/zenShare.js](../../src/core/zenShare.js) | Recibos, PDFs e compartilhamento | 3 | Integração pendente |
| [src/data.js](../../src/data.js) | Catálogo e preços | 6 | Integração pendente |

Detalhes por linha e sinais encontrados: `INVENTARIO.json`.

Antes de concluir: revisar também aliases sem sufixo BRL, fórmulas dinâmicas, configurações, funções de backend, importações, tarefas e valores derivados que a busca não identifica.

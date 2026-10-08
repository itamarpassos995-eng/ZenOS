# ATT 08.1 — Auditoria arquivo por arquivo do `src/`

Arquivos verificados: **44**. Comparação feita contra a ATT 08 imediatamente anterior.

| Arquivo | Estado vs ATT 08 | Observação |
|---|---|---|
| `src/App.jsx` | **ALTERADO** | CORRIGIDO — isolamento por UID; reset de sessão; câmbio por loja; defaults seguros do semáforo; props necessárias para recibo/reembolso. |
| `src/components/Clientes.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/components/Comissoes.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/components/Configuracoes.jsx` | **ALTERADO** | CORRIGIDO — cache de perfil por UID; limites seguros do semáforo. Restante do layout/fluxo preservado. |
| `src/components/DashboardMobile.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/components/Despesas.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/components/EnvironmentBanner.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/components/EstoqueInteligente.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/components/Fornecedores.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/components/GestaoCaixas.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/components/LandingPage.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/components/Login.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/components/Mesas.jsx` | **ALTERADO** | CORRIGIDO — cache de mesas namespaceado por UID; lógica de mesas preservada. |
| `src/components/Migracao.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/components/PDV.jsx` | **ALTERADO** | CORRIGIDO — estoque rápido Vitrine/Depósito; snapshot de câmbio; totais multimoeda; troco na moeda correta; auditoria de estoque inicial. |
| `src/components/PDVCompras.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/components/Produtos.jsx` | **ALTERADO** | CORRIGIDO — alinhamento visual do bloco Custo/Margem/Preço/Vitrine/Depósito; lógica cadastral preservada. |
| `src/components/TerminalLogin.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/components/Vendas.jsx` | **ALTERADO** | CORRIGIDO — seleção do caixa físico para devolução; totais multimoeda na reimpressão; popup nativo de impressão removido. |
| `src/components/ZenModal.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/cashSession.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/commissionEngine.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/commissions.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/dates.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/financialLedger.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/financialLedgerCore.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/inventory.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/orderItems.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/persistenceSafety.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/pricing.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/productIdentity.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/productRegistry.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/profitability.js` | **ALTERADO** | CORRIGIDO — configuração 0/0 não desativa o semáforo; fallback seguro 30/15. |
| `src/core/receiptCurrency.js` | **NOVO** | NOVO — utilitário puro para totais equivalentes no recibo. |
| `src/core/runtimeEnvironment.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/salesFinancials.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/stockAudit.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/stockAuditCore.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/storage.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/core/storeProfile.js` | **ALTERADO** | CORRIGIDO — perfil/logo local isolado por UID; removida leitura de chave genérica compartilhada. |
| `src/data.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/firebase.js` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/index.css` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |
| `src/main.jsx` | **IDÊNTICO** | Hash idêntico ao baseline; nenhuma alteração nesta corretiva. |

## Varreduras globais

- Nenhum arquivo `src/` foi removido.
- Nenhuma ativação de V2 ou migração automática foi encontrada.
- Nenhum `localStorage.clear()` foi introduzido.
- Chaves operacionais locais revisadas: perfil/logo, comissão e mesas agora são segregados por UID.
- `deleteDoc` existente em `productRegistry.js` pertence exclusivamente à liberação de reserva de índice de unicidade de produto e já existia no baseline; nenhum `deleteDoc` novo foi adicionado nesta ATT.
- Diálogos nativos no `src/`: 37 no baseline ATT 08 → 35 após a ATT 08.1. Nenhum novo diálogo nativo foi introduzido nos arquivos modificados; PDV e Vendas ficam sem `alert/confirm/prompt` nativos nos fluxos corrigidos.

## Arquivos realmente alterados no runtime

- `src/App.jsx`
- `src/components/Configuracoes.jsx`
- `src/components/Mesas.jsx`
- `src/components/PDV.jsx`
- `src/components/Produtos.jsx`
- `src/components/Vendas.jsx`
- `src/core/profitability.js`
- `src/core/storeProfile.js`
- `src/core/receiptCurrency.js`

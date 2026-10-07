# ATT 10.1 — Relatório RC1

## Baseline
- ZIP: `ZenOS-ATT09-RC1.3-CONCILIACAO-ELETRONICA-FECHAMENTO.zip`
- SHA-256: `ea3d5088cb6961f8f52c1d0efad4677d5614b0d414cf8d0d8d3f332dfbbf7391`
- A ATT 10 rejeitada não foi usada como fonte de código.
- Regressão da baseline: ATT 01 → ATT 09 aprovadas.

## Visual implementado
- Dashboard premium baseado no conceito aprovado.
- Hero “Olá, ...” com identidade ZenOS e dispositivos desenhados por CSS usando somente `/logo-zenos.png`.
- Sidebar persistente com estado aberto e compacto.
- Gavetas: Vendas, Estoque e Compras, Clientes e Fiado, Caixa, Gestão e Financeiro, Administração.
- Acessos rápidos coloridos usando telas reais existentes.
- Tema escuro e tema claro.
- Preferência de tema isolada por UID usando `zenosStorage` (que já aplica namespace do ambiente).
- Topbar preserva sincronização, idioma, moeda/câmbio, operador e troca de operador.

## Paridade funcional
A matriz completa está em `docs/ATT101_FUNCTIONAL_PARITY.md`.

Funções de `App.jsx` removidas em relação à baseline: **ZERO**.
Estados React removidos em relação à baseline: **ZERO**.
Estados adicionados: somente `temaUi` e `sidebarCompacta`.

Todos os módulos do menu antigo permanecem com destino real:
- PDV Balcão
- Entrada / PDV Compras
- Mesas / Comandas
- Produtos & Estoque
- Clientes & Fiado
- Fornecedores
- Histórico / Vendas & Devoluções
- Inteligência de Estoque
- Comissões
- App Mobile CEO
- Despesas
- Configurações / Backup
- Auditoria de Caixas
- Importar Dados

## Correção funcional explicitamente autorizada
A baseline continha uma inconsistência antiga: o card rápido abria o PDV com caixa fechado, mas o menu legado bloqueava esse mesmo acesso. A regra aprovada pelo usuário é que o vendedor pode abrir o PDV e gerar Pré-Pedido sem turno de caixa. A ATT 10.1 remove somente o bloqueio da navegação. Nenhuma regra interna de recebimento foi alterada.

## Core protegido byte a byte
Mantidos sem alteração e verificados por SHA-256 em `test:att101`:
- `src/components/PDV.jsx`
- `src/components/Produtos.jsx`
- `src/components/Clientes.jsx`
- `src/components/Vendas.jsx`
- `src/components/PDVCompras.jsx`
- `src/components/Despesas.jsx`
- `src/components/Comissoes.jsx`
- `src/components/GestaoCaixas.jsx`
- `src/components/Configuracoes.jsx`
- `src/components/ZenModal.jsx`
- `src/core/cashSession.js`
- `src/core/inventory.js`
- `src/core/profitability.js`
- `src/core/productIdentity.js`
- `src/core/persistenceSafety.js`
- `src/core/backupRecovery.js`
- `src/core/financialLedger.js`

## Arquivos alterados
- `src/App.jsx` — integração visual, paridade de navegação, tema e normalização explícita do acesso ao PDV sem caixa.
- `package.json` — somente script `test:att101`.

## Arquivos criados
- `src/components/ZenVisualLayout.jsx`
- `src/zenos-dashboard.css`
- `scripts/att101-check.mjs`
- `docs/ATT101_FUNCTIONAL_PARITY.md`
- `docs/ATT101_REPORT.md`

## Arquivos removidos
**ZERO.**

## Testes executados
- ATT 01 ✅
- ATT 01.1 ✅
- ATT 02 ✅
- ATT 03 ✅
- ATT 04 ✅
- ATT 06 ✅
- ATT 06.1 ✅
- ATT 06.2 ✅
- ATT 07 ✅
- ATT 07.1 ✅
- ATT 08 ✅
- ATT 08.1 ✅
- ATT 08.2 ✅
- ATT 08.3 ✅
- ATT 09 ✅
- ATT 10.1 ✅ 42/42
- Parse JSX (`App.jsx` + `ZenVisualLayout.jsx`) ✅

## Build
Não certificado neste ambiente Linux porque as dependências nativas do Rollup/Vite do projeto são específicas do ambiente Windows usado pelo usuário e a instalação Linux não pôde ser concluída. **A RC1 não deve ser considerada FINAL até `npm.cmd run build` passar no computador do usuário.**

## Testes manuais obrigatórios antes de FINAL
1. Administrador + caixa fechado → PDV deve abrir.
2. Vendedor sem permissão de caixa → PDV deve abrir.
3. Gerar Pré-Pedido sem caixa.
4. Operador de caixa recuperar e receber o Pré-Pedido.
5. Abrir Compras.
6. Abrir Histórico / Vendas e Devoluções.
7. Abrir Fornecedores, Inteligência, Comissões, App CEO, Despesas, Auditoria e Importação conforme permissões.
8. Tema escuro e claro.
9. Sidebar aberta e compacta.
10. 1920x1080, 1366x768 e 1280x720.

## Status
**RC1 — pronta para build e homologação visual/funcional no Windows. Ainda não é FINAL.**

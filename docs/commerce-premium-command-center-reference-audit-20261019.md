# ZenOS Commerce Premium — Central operacional, análise das 7 referências

**Data:** 19/10/2026  
**Escopo do PR:** Somente frontend interno e testes, sobre `feat/commerce-cart-ephemeral-customer-optin-20261019`. Não alterar PDV, Functions, Auth, Firestore, Storage, estoque, clientes financeiros, checkout público ou serviço de produção.

## Referências enviadas — análise individual

1. **ZenOS atual, lista de pedidos** — vários pedidos cancelados em cards extensos, repetindo subtotais/itens e obrigando o operador a rolar muito para achar pedidos ativos. Nova visão geral limita-se a 4 ativos, e histórico é acessível quando necessário.
2. **ZenOS atual, histórico e clientes ao fundo** — pedido em atendimento se perde entre cancelados; sessão de clientes está dentro da mesma rolagem longa. Nova fila exclusiva com busca e detalhes sob demanda; clientes ocupam navegação própria.
3. **SMB — Informações do catálogo** — mostra separação por áreas e resumo de link/identidade. Retivemos a ideia de navegação principal sem copiar identidade, fluxo de contratação ou URL do concorrente.
4. **SMB — Design** — editor e prévia ao lado facilitam entendimento instantâneo. O ZenCommerceStudio já permite prévia e foi preservado *montado* na aba Personalizar; rascunho não salvo não é apagado por troca de seção.
5. **SMB — Vendas** — recursos com alternâncias aparentes e confirmação de estados. No ZenOS, preferimos manter operações de faturamento no PDV existente, não criar novos toggles falsamente operacionais nem reimplementar checkout financeiro.
6. **SMB — Frete** — agrupamento por finalidade e regiões de entrega. Gestão de atendimento/configuração fica separada da fila; regras de frete não foram implementadas ou alteradas neste PR.
7. **SMB — Notificações** — contador sempre visível e lista breve em sobreposição, com acesso direto à fila. ZenOS já tem aviso global; preservado, com abertura da nova aba Pedidos em vez da lista longa. A lista em popover é melhoria adicional dependente de avaliação posterior, sem impactar a fila.

## Nova arquitetura

- **Visão geral:** estado da loja, quatro indicadores e até quatro pedidos ativos, atalhos para clientes/estúdio.
- **Pedidos:** exibe ativos por padrão, busca por cliente/id/telefone, estado e intervalo de datas, 12 por página do conjunto carregado. Histórico de concluídos/cancelados separado, mas nunca apagado.
- **Detalhes:** lista compacta abre `ZenCommerceOrderCard` no painel lateral desktop ou painel responsivo mobile. Ações chamam as funções já existentes em `ZenCommercePortal`. Nenhum faturamento é realizado pelo componente.
- **Clientes:** listagem autenticada existente em painel próprio. Nenhum dado promocional é tratado como opt-in verificado.
- **Personalizar loja:** componente `ZenCommerceStudio` permanece montado em área oculta, preservando alterações em memória enquanto muda de aba.
- **Configurações:** contato comercial e publicação isolados da fila, callbacks originais reutilizados.

## Restrições e limitações honestas

- A função `listarPedidos` atualmente devolve apenas os **últimos 50 registros**. A paginação de 12 é sobre essa amostra; o sistema não promete que os contadores refletem o histórico total. A tela explicita esse limite.
- `listarClientesOnline` devolve até 50 cadastros. Nenhuma operação de marketing é liberada.
- Paginação remota por cursor, busca no histórico integral e dashboard de métricas financeiras precisarão de mudança de contrato com novos testes em Firebase Emulator; não simulamos dados financeiros nem alteramos consultas em produção.
- Todas as ações continuam autorizadas no backend. Nenhuma mudança em dados financeiros, preços, estoque ou cobrança.
- Alteração de loja/operador reinicia seleção e busca locais, evitando apresentação cruzada.
- PR em modo rascunho. Nenhum deploy foi realizado por esta execução.

## Gate para homologação

- CI Commerce completo, incluindo testes de regras de duas lojas e 8+ testes do novo painel;
- Proteção de regressões do ZenOS (PDV, fiado, estoque, caixa);
- Inspeção desktop e mobile com dados fictícios;
- Validação de aviso global + pré-pedido existente + rascunho não salvo + status de cancelados;
- Somente canal temporário HML, sem main, sem alterar funções nem regras e sem produção.

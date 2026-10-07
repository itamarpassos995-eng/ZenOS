# ATT 10.1 — Matriz de Paridade Funcional

Baseline: `ZenOS-ATT09-RC1.3-CONCILIACAO-ELETRONICA-FECHAMENTO.zip`
SHA-256: `ea3d5088cb6961f8f52c1d0efad4677d5614b0d414cf8d0d8d3f332dfbbf7391`

A ATT 10 rejeitada não foi usada como fonte de código. As imagens conceituais serviram somente como referência estética.

| Função da baseline | Permissão original | Novo local | Destino/handler preservado | Status |
|---|---|---|---|---|
| Painel Inicial | autenticado | Sidebar > Painel Inicial | `setEcraAtual('hub')` | PRESERVADO |
| PDV Balcão / Pré-Pedido | `pdv` | Vendas + Acessos Rápidos | `setEcraAtual('pdv')` | PRESERVADO |
| Entrada / PDV Compras | `produtos` | Estoque e Compras + Acessos Rápidos | `setEcraAtual('compras')` | PRESERVADO |
| Mesas / Comandas | `mesas` | Vendas | `setEcraAtual('mesas')` | PRESERVADO |
| Produtos & Estoque | `produtos` | Estoque e Compras + Acessos Rápidos | `setEcraAtual('produtos')` | PRESERVADO |
| Clientes & Fiado | `clientes` | Clientes e Fiado + Acessos Rápidos | `setEcraAtual('clientes')` | PRESERVADO |
| Fornecedores | `produtos` | Estoque e Compras | `setEcraAtual('fornecedores')` | PRESERVADO |
| Histórico / Vendas & Devoluções | `vendas` | Vendas + Acessos Rápidos | `setEcraAtual('vendas')` | PRESERVADO |
| Inteligência de Estoque | `inteligencia` | Estoque e Compras | `setEcraAtual('inteligencia')` | PRESERVADO |
| Comissões | `admin` | Gestão e Financeiro + Acessos Rápidos | `setEcraAtual('comissoes')` | PRESERVADO |
| App Mobile CEO | `admin` | Gestão e Financeiro | `setEcraAtual('dashboardMobile')` | PRESERVADO |
| Contas a Pagar / Despesas | `despesas` | Gestão e Financeiro + Acessos Rápidos | `setEcraAtual('despesas')` | PRESERVADO |
| Configurações / Backup / Equipe | `admin` | Administração + Acessos Rápidos | `setEcraAtual('configuracoes')` | PRESERVADO |
| Auditoria de Caixas | `admin` | Caixa | `setEcraAtual('auditoria_caixas')` | PRESERVADO |
| Importar Dados | `admin` | Administração | `setEcraAtual('migracao')` | PRESERVADO |
| Meu Turno de Caixa | `pdv` conforme baseline | Caixa + card Home | Home + `setTipoMovCaixa` existente | PRESERVADO |
| Suprimento | turno ativo | card Meu Turno | handler existente | PRESERVADO |
| Sangria | turno ativo | card Meu Turno | handler existente | PRESERVADO |
| Fechamento Cego | turno ativo | card Meu Turno | `processarFechamentoCego` | PRESERVADO |
| Painel Executivo | `inteligencia` | Home recolhível | `setMostrarPainelExecutivo` | PRESERVADO |
| Trocar Operador | autenticado | Topbar | `trocarOperador` | PRESERVADO |
| Sair da loja | autenticado | rodapé da sidebar | `fazerLogout` | PRESERVADO |
| Editar nome e logo | `admin` | sidebar aberta | mesmos estados/modal existentes | PRESERVADO |
| Idioma | autenticado | Topbar | `setIdioma` | PRESERVADO |
| Moeda / câmbio | autenticado | Topbar | `setMoeda` / `setModalCambioAberto` | PRESERVADO |

## Regra PDV + caixa fechado

A baseline possuía uma inconsistência: o card rápido já chamava `setEcraAtual('pdv')` diretamente, enquanto o menu legado bloqueava o PDV quando não havia turno. A regra aprovada pelo usuário é inequívoca: o PDV pode abrir sem caixa para gerar Pré-Pedido; o recebimento continua sujeito às regras já existentes do PDV/caixa. A ATT 10.1 uniformiza somente essa navegação, sem alterar o motor do PDV.

## Funções removidas

**ZERO.**

## Botões decorativos sem função

**ZERO.** Todos os cards e itens de navegação possuem handler real ou representam uma ação real já existente.

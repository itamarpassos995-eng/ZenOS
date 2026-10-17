# ZenOS — Home Premium Comercial (homologação)

Branch isolada criada a partir de 711eb434ae6a909f08905ca7cb41bde72c918a85.

## Objetivo
Criar uma homepage pública clara, original, acessível, mobile-first e orientada à conversão de visitantes do Instagram, com login existente acessível por “Entrar no ZenOS”.

## Escopo
- Hero editorial luminoso, azul profundo, turquesa e âmbar, com identidade ZenOS.
- Seções visuais: inteligência de estoque (Curva ABC, alertas e capital imobilizado), PDV, financeiro, compras, fornecedores.
- Seção educativa “Quanto custa não ter controle?” com cálculos ilustrativos identificados.
- Diferenciar módulos disponíveis de ZenOS Connect e Fiscal em desenvolvimento.
- Solicitação real de demonstração apenas com destino validado, consentimento, antispam e confirmação efetiva de recebimento.
- Mobile-first, acessibilidade, SEO, performance e medição de conversões sem dados pessoais desnecessários.

## Limites obrigatórios
- NÃO modificar Firestore, migrações V1/V2, regras, funções, autenticação, PDV, fiado, caixa, estoque ou dados de clientes.
- NÃO alterar LandingPage.jsx antes de mapear login/cadastro/recuperação e homologar a estratégia de roteamento.
- NÃO usar dados reais de clientes na vitrine; demonstrações com dados fictícios.
- NÃO habilitar custos, serviços externos, merge ou deploy de produção sem aprovação explícita.
- Fazer mudanças mínimas e reversíveis.

## Achados iniciais
- src/App.jsx importa src/components/LandingPage.jsx.
- LandingPage.jsx concentra login, cadastro, recuperação e demonstração.
- O ramo view === 'demo' atualmente apenas mostra mensagem de sucesso, sem persistência/envio.
- LandingPage.jsx injeta CSS global com overflow:hidden no body/html, incompatível com portal rolável se mantido na página pública.
- O projeto usa React 18, Vite 5 e Firebase; há emuladores para testes.

## Portões de homologação
1. Mapear navegação não autenticada e efeitos globais da LandingPage.
2. Produzir vitrine independente e revisar cópias/recursos existentes.
3. Garantir fluxo do botão Entrar no ZenOS para autenticação atual, sem modificar a lógica de login.
4. Configurar e testar solicitação real de demonstração em ambiente isolado.
5. Testar desktop, mobile, acessibilidade, build e regressões críticas.
6. Apresentar prévia navegável e obter aprovação antes de qualquer publicação.

# ZenOS Commerce — loja operacional fictícia na nuvem

**Branch isolada**: `feat/commerce-operational-hml-shell-20261019`, dependente dos PRs #52, #51 e #50. **Não publicada.**

## Objetivo
Homologar o fluxo comercial completo com o próprio aplicativo ZenOS (não somente o Studio), usando exclusivamente o projeto Firebase **zenos-commerce-homologacao**. O site de homologação atual continua funcionando no seu modo separado; este modo operacional é **interno** e não deve ser exposto aos lojistas.

## Como se comporta o modo `commerce-operational-hml`
- O Vite recusa compilar se o SDK não apontar exatamente para o projeto, domínio Auth e bucket da homologação, ou se `VITE_ZENOS_COMMERCE_OPERATOR_BRIDGE` não estiver `true`.
- O ZenOS inicializa o Firebase cloud isolado, sem os emuladores locais e sem fallback à configuração do projeto **zenos-ac6b2**.
- O acesso inicial só permite Google autenticado. Antes de montar o aplicativo, uma Function verifica o proprietário autorizado da homologação. Nenhum usuário não autorizado pode criar a loja de teste.
- O proprietário escolhe dois PINs de teste, distintos, com PBKDF2 v2. A Function cria em transação o documento da loja (`lojas/{auth.uid}`), operação V1 com **dois produtos fictícios**, históricos/caixa vazios, dois operadores e credenciais privadas. A licença fictícia é limitada ao projeto de homologação; não há cobrança nem acesso à produção.
- A Function é **create-only**: não substitui loja já criada, não reseta uma preparação parcial nem modifica registros preexistentes. Se a criação já ocorreu, a ação de consulta pode reconhecer o estado; se houver divergências, bloqueia.
- Depois do provisionamento autenticado, o aplicativo operacional real do ZenOS é montado. Operador A/B podem testar o fluxo normal de PIN e o Commerce pelo portal integrado. Duas abas/terminais usam o mesmo UID de loja, mas operadores separados.
- O modo tem storage local isolado `zenos_cloud_hml__` e banner interno. Nenhum padrão do login operacional em produção foi alterado.

## Limites e bloqueios de segurança
- **A configuração padrão da homologação continua deny-all**. As novas regras para testes operacionais existem em `firestore.commerce.operational-hml.rules`, mas **não são selecionadas por nenhum script de deploy**. Isso é intencional. Elas só podem ser habilitadas em projeto isolado, após testes de regras no emulador, auditoria e autorização específica.
- As novas regras restringem acesso ao proprietário Google verificado e à loja cujo UID coincide com o da identidade, com marcador `homologacao_operacional`. Coleções Commerce privadas/pedidos continuam inacessíveis ao cliente; recibos de faturamento só admitem criação vinculada a pedido em atendimento e venda canônica V1.
- **Somente V1 operacional** está preparada nesta fase. Não liberar testes V2 na cloud com estas regras; testes integrados V1/V2 permanecem nos emuladores existentes.
- A Function `commerceHmlOperationalSeed` foi exportada, mas **não foi implantada**. Uma publicação cloud requer plano específico para Functions + regras com rollback e sem trocar a experiência atual de homologação. Nenhum serviço de produção deve ser tocado.
- Não compartilhar PINs, criar contas reais, importar cadastros ou habilitar checkout/pagamentos reais na homologação.
- Mesmo com CI aprovado, é obrigatório testar visualmente no navegador autenticado: pedido fictício recebido, contador global, reabertura do mesmo pré-pedido, dois operadores, refresh/offline, baixa única de estoque/caixa, Share V2 e dispositivos móvel/desktop.

## Verificação antes do próximo gate
```sh
npm ci --ignore-scripts
node scripts/commerce-cloud-hml-safety-check.mjs
node scripts/commerce-cloud-hml-deploy.mjs --check
```
O primeiro script executa compilações negativas para SDK inválido/produtivo, flag ausente e configuração errada, e compila os dois modos HML com SDK fictício, sem credenciais de nuvem. A suite de Functions verifica identidade e PIN do bootstrap. Os emuladores do CI exercitam pedido/PDV/estoque/caixa e isolamento, mas **não substituem** o teste online do novo shell.

## Condições para liberação posterior
1. Provar regras operacionais dedicadas em emulador contra leituras e gravações cruzadas, acesso privado, recibo falso e autenticação não autorizada.
2. Revisar deploy com lista explícita de Functions, projeto/bucket/conta, proteção de produção e rollback não destrutivo.
3. Executar implantação de HML somente após essa comprovação; não alterar a configuração global do site de demonstração atual sem plano de coexistência.
4. Validar manualmente o site em navegador autenticado, com logs e dados fictícios, em computador e celular.
5. Manter PRs em draft até aprovação da jornada inteira. Publicação em `zenos.app.br` e merge na main requerem autorização independente.

**Resultado atual:** preparação de código e testes CI, não homologação funcional na nuvem nem liberação para clientes.

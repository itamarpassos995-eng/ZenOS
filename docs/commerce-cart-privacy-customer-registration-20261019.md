# Commerce HML — Carrinho efêmero e cadastro opcional

## Carrinho após checkout
- Carrinho, formulário, chave de envio e recibo ficam só na memória; chave legada do sessionStorage apagada sem leitura.
- O pedido confirmado permanece no Firestore da loja e na central do ZenOS. A interface limpa as quantidades imediatamente, mas mantém o comprovante na tela até fechar ou recarregar.
- Atualizar antes ou depois do envio descarta carrinho, recibo e dados pessoais no navegador. A identidade anônima também usa apenas memória.
- Em falha de rede, o carrinho fica bloqueado na aba atual até consultar o mesmo envio, sem reenviar automaticamente.
- Restrição consciente: após recarregar uma aba em que a resposta foi perdida, não há código/chave local para recuperar o envio; o consumidor deve consultar a loja. A idempotência server-side só se aplica à mesma chave. Isso atende à exigência de zero histórico local.

## Cadastro de comprador opcional
- Cliente pode concluir pedido sem se cadastrar. Cadastro e permissão para promoções são dois consentimentos independentes, desmarcados inicialmente.
- Backend valida consentimentos; promoções sem cadastro são rejeitadas.
- Cadastro escolhido é salvo atomicamente com o pedido em coleção privada commerce_clientes da mesma loja, com chave hash de comprador anônimo e telefone.
- Lojista vê clientes cadastrados no painel Minha Loja Online, após autorização pelo mesmo operador. Compra pública não permite listagem.
- Telefone informado não foi verificado. Marketing fica pendente_verificacao e marketingAutorizado=false até confirmação de titularidade e descadastro; não há envio de campanhas.
- Os novos registros ficam na base exclusiva de clientes do Commerce, sem tocar os campos de crédito, caixa, contas de clientes ou documentos V1/V2. Importação para cadastro financeiro Clientes e Fiado requer etapa posterior com deduplicação e escrita canônica aprovada.

## Verificações manuais obrigatórias
1. Após compra, quantidade zerada; F5 não recupera carrinho, formulário nem recibo.
2. F5 durante escolha anterior ao envio também limpa sem criar pedido.
3. Em falha de rede simulada, consultar o mesmo envio na aba atual não gera pedido novo.
4. Cadastro sem marketing e cadastro com marketing testados, servidor recusa combo inválido.
5. Outra loja/operador não pode ler registros; backend não altera estoque nem financeiro.
6. Reabertura de pedido no PDV e faturamento único permanecem funcionando.

## Entrega controlada
- Com CI aprovado e commit exato: node scripts/commerce-hml-customer-checkout-deploy.mjs --check
- Com autorização, deploy isolado de duas Functions HML: node scripts/commerce-hml-customer-checkout-deploy.mjs --deploy-commerce
- Preparar SDK HML e publicar somente canal op-hml-19 via commerce-operational-hml-preview.mjs --publish-short-preview.
- Sem merge em main, sem publicação em zenos.app.br, sem mexer no Firebase de produção.

## Incidente reproduzido em 19/10: janela travada após F5
- Evidência: modal 'Seu carrinho' com subtotal, campos desabilitados, aviso 'A confirmação deste envio precisa ser verificada' e erro 'Ação inválida. [400]'.
- Causa confirmada no frontend anterior: sessionStorage recuperava pendente=true e reabria checkout automaticamente. Consulta do envio foi rejeitada com 400 pela função HML. A rejeição sugere incompatibilidade de contrato com a versão do servidor; não é prova de pedido inexistente.
- Correção no novo checkout: após F5 a página nasce vazia; nenhuma consulta automática é feita. Durante falha ambígua na aba ainda aberta, tela de recuperação substitui formulário desabilitado; botões permitem consultar, falar com a loja ou sair e limpar a tentativa após aviso explícito. Encerrar não mexe no pedido remoto.
- Ordem de publicação: atualizar commerceLoja e commercePedidosAdmin SOMENTE na HML; executar node scripts/commerce-hml-customer-checkout-deploy.mjs --verify-remote; a chamada sem autenticação deve retornar HTTP 401 UNAUTHENTICATED, comprovando que consultarPedido foi reconhecida (nunca 400 'Ação inválida'). Somente depois publicar o Hosting de prévia.
- No site anterior não executar novas compras repetidas sem primeiro conferir se o pedido foi registrado no ZenOS.


## Acabamento e endurecimento antes da homologação (19/10)
- Checkout: cartão de cadastro com opção desmarcada, explicação sobre identidade do contato e consentimento para promoções separado e também desmarcado. Responsivo e com alvos de toque ampliados.
- A chave interna de contato é estável por loja + telefone internacional validado; trocar de celular/navegador não gera uma segunda ficha para o mesmo número na mesma loja. Não vincular à identidade anônima, que é intencionalmente apagada ao atualizar.
- Todos os registros novos permanecem **não verificados**. Em caso de perfil previamente verificado, um pedido com telefone informado sem verificar titularidade **não altera nenhum campo nem associa o pedido ao cadastro verificado**. O pedido é mantido separadamente na fila para conferência.
- Acesso rápido **Clientes online** dentro da central de pedidos, mantendo leitura protegida pela função administrativa. Ao trocar de loja/operador, resultados pendentes são descartados antes de renderização.
- Nada é gravado nas coleções financeiras V1/V2 ou no módulo Clientes & Fiado; não implementar campanhas automáticas.
- O gate de implantação `commerce-hml-customer-checkout-deploy.mjs --check` passa a verificar também o helper de proteção de cadastro.

## Gate de publicação
Sem sucesso do CI Commerce (inclusive emuladores com duas lojas), proteção geral V1/V2 e teste com cliente fictício, **não publicar nenhuma função nem novo checkout**.
Após teste aprovado, atualizar exclusivamente as funções `commerceLoja` e `commercePedidosAdmin` no Firebase isolado, verificar resposta remota de `consultarPedido`, atualizar apenas o canal temporário `op-hml-19` e homologar em celular e computador. Loja oficial intacta.

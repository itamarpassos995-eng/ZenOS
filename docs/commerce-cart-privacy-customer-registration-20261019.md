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

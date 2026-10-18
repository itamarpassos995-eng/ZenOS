# Commerce → PDV — etapa isolada sobre #49

O pedido prepara um rascunho com identidade dos produtos originais, quantidades e preço validado no recebimento. A conferência e o pagamento continuam no PDV. Não há baixa de estoque, lançamento financeiro ou reserva de mercadoria ao importar. A aba pública e o Share V2 aprovado não foram reescritos.

## Controles implementados

- `prepararPDV` exige autorização/licença no servidor, fixa operador responsável e ID `COMMERCE-{pedidoId}`. Outro operador não pode assumir automaticamente. O responsável pode retomar em outro dispositivo.
- O rascunho por loja/operador não substitui atendimento existente, preserva edições ao reabrir o mesmo pedido e guarda referência mesmo se o carrinho ficar vazio. Sem imagens ou PIN no armazenamento do rascunho.
- Preço online é aplicado apenas ao item da venda; vincular um cliente não recalcula silenciosamente o preço do pedido. Conferência pelo operador permanece necessária; mudanças posteriores são registradas na venda, sem editar o pedido original ou o produto.
- A venda mantém ID/data nas tentativas e usa o commit operacional existente. A guarda `commerce_order_once` acrescenta um recibo imutável em `commerce_faturamentos` na mesma transação V1/V2 que estoque, histórico, auditoria e financeiro. Sem guarda, a operação comum não lê nem grava recibo Commerce.
- Recibo já existente bloqueia novas baixas, mesmo após expulsão do cache de operações recentes ou remoção do histórico. Conflito preserva rascunho e exige recuperação no pedido; não cria outro ID para contornar a trava.
- `confirmarFaturamento` somente vincula/encerra o pedido quando recibo e venda canônica correspondem. Falha nessa confirmação não desfaz nem repete venda já gravada. Abrir novamente o pedido recupera o vínculo e remove somente o rascunho correspondente após confirmação autoritativa.
- Pré-pedido/orçamento não são destinos para o pedido online. Resgate de outro documento não substitui o atendimento Commerce.
- Conclusão normal usa o recibo e o compartilhamento do PDV/Share V2 existente. Não transforma pedido recebido em comprovante de pagamento.

## Regras e ambiente

As regras alteradas são EXCLUSIVAMENTE de emulador. A nova coleção foi excluída do allow genérico sobreposto. Somente a loja proprietária lê/cria; a criação exige pedido preparado no servidor e venda correspondente via `getAfter`. Update/delete são negados, inclusive à própria loja. Regras reais da nuvem não foram alteradas e precisam revisão equivalente antes de ativar a integração.

O código continua atrás da ponte de sessão desligada por padrão. Sem merge/main, deploy de produção, dados reais, novos fornecedores ou cobrança. Homologação operacional autenticada na nuvem ainda depende dos bloqueios documentados em `commerce-integracao-sessao-20261018.md`: credenciais privadas provisionadas, gerenciamento/revogação, sessão e ambiente que nunca recorra à produção.

## Testes e limites

Validação local: builds com flag ligada/desligada; 109 testes Functions; 12 testes UI Commerce (incluindo PDV real com falha/retry, valores, estoque e guarda); regressões de negócio e 9 testes UI do gate de release. Testes de emulador adicionados ao CI: dois terminais concorrentes V1/V2, uma única venda/baixa/entrada, recuperação e rejeição de alteração/exclusão do recibo e criação sem venda. Resultado do CI deve ser registrado no PR; não confundir código de teste com execução aprovada.

Ainda NÃO executados nesta etapa: jornada no navegador autenticado em homologação na nuvem, mobile/desktop e rolagem por mouse/toque/teclado, compartilhamento nativo/WhatsApp real, falha de rede real no navegador e liberação com plano de cliente. Não apresentar a integração como pronta para produção antes dessas provas.

Não há transferência automática de atendimento entre operadores: evita liberar um pedido cujo fechamento pode estar em andamento. Recuperação administrativa de operador indisponível precisa fluxo explícito, nunca apagar recibos. Paginação da fila/catálogo e grandes volumes permanecem pendentes. Checkout/entrega/pagamento continuam respeitando as limitações existentes, sem ativação de pagamentos automáticos.

## Custos e rollback

Sem novo serviço. Cada faturamento adiciona uma leitura/gravação pontual e permanente de recibo; preparar/confirmar leem pedido, licença e rota/venda canônica. Regras usam leituras auxiliares limitadas. Sem listener por produto ou cópia de fotos.

Rollback: manter a flag desativada e reverter o PR isolado. Se já houver recibos/vendas em homologação, preservar todos; não removê-los como rollback. Antes de qualquer ativação futura em produção, garantir que a versão de retorno continue reconhecendo vendas Commerce e suas travas.

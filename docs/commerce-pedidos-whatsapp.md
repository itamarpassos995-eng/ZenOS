# Commerce — catálogo, pedidos e WhatsApp

## Escopo escolhido pelo proprietário

Primeira versão com catálogo público, carrinho, pedido salvo no ZenOS e atendimento pelo WhatsApp. Pagamento, frete e disponibilidade são confirmados pela loja. Não existe cobrança online automática. O pedido não reserva estoque, não altera produto, não registra venda e não movimenta caixa. O atendimento comercial pode ocorrer pelo processo normal da loja; encerrar um pedido nesta fila não equivale a lançar uma venda no PDV.

## Funcionalidade implementada

- Rota `/loja/{idPublico}`: banners, pesquisa, categorias, produtos selecionados, detalhes, galeria e carrinho; layout usa as cores/textos do Studio. Preços em BRL, conforme o editor existente.
- Publicação individualmente autorizada pelo servidor, com licença ativa e revisão do rascunho. ID público aleatório e estável, independente do nome e do UID da loja. O WhatsApp exige código do país. Publicação/despublicação não alteram cadastros operacionais.
- `commerceLoja`: catálogo allowlist com dados selecionados; foto de cadastro sincronizada em armazenamento privado ou HTTPS válido; nunca devolve custo, fornecedor ou imagem Base64 operacional. URLs temporárias somente para fotos dos produtos publicados.
- Pedido exige sessão Firebase (anônima para comprador), nome, telefone e autorização de contato. O servidor lê preço/saldo canônicos. Se o total exibido divergir, exige atualizar antes de confirmar. SKU externo, quantidade inválida e estoque insuficiente são rejeitados.
- Chave de idempotência vinculada ao UID do comprador; duas requisições simultâneas geram um documento. O recibo com link WhatsApp só é devolvido depois da persistência. Reenvio idêntico recupera o pedido, sem nova cobrança, quota ou documento.
- Pedidos em `lojas/{lojaId}/commerce_pedidos`, isolados das vendas. Fila administrativa dos últimos 50, contato pelo WhatsApp e status recebido/em atendimento/encerrado/cancelado. Cliente não lê nem escreve diretamente; operador de outra loja não gerencia o pedido.
- Suspensão de licença bloqueia catálogo e pedido na chamada seguinte. Retirar do ar preserva os pedidos e o ID público.
- Quotas de teste: 500 pedidos/loja/dia, 10 por comprador/loja/dia; upload 60 MB e 256 pares de fotos/loja/dia, com reserva transacional antes da escrita e retry sem consumir novamente. Falhas de upload mantêm a reserva, evitando escapar do orçamento por retry.

## Executar na homologação separada

No PowerShell já autenticado em `itamarbenit@gmail.com`, na cópia da branch do PR #30:

```powershell
git pull --ff-only
node scripts/commerce-cloud-hml-deploy.mjs --check
node scripts/commerce-cloud-hml-deploy.mjs
```

O script tem projeto/conta fixos. Implanta somente cinco funções Commerce, Google Auth e comprador anônimo, regras de nuvem que negam todo acesso direto, e Hosting do projeto `zenos-commerce-homologacao`. A configuração Firestore cria `(default)` Standard em us-east1 caso ainda não exista; não recria nem migra banco existente. Não usa as regras de emulador nem publica funções fiscais. A configuração pública do SDK é obtida pelo CLI, salva em arquivo local ignorado pelo Git e usada num build exclusivo `dist-commerce-hml`. O site de teste impede carregar o App operacional. Não contém credenciais privadas.

A URL esperada, exibida pelo CLI somente depois do deploy bem-sucedido, é `https://zenos-commerce-homologacao.web.app/commerce-homologacao`. A existência/acessibilidade dessa URL ainda não foi verificada no Work.

Na página de teste, entrar com a conta Google individual `itamarbenit@gmail.com`. Se não existir vínculo, usar **Preparar minha loja fictícia de teste**. O provisionamento exige exatamente o projeto de homologação, flags seguras e essa conta Google com e-mail verificado. Cria somente uma loja fictícia, produto WebP demonstrativo, vínculo individual e licença fictícia de homologação sem cobrança. Não sobrescreve registros existentes; repetir não reativa permissão/licença revogada. Nenhum dado da produção é copiado.

Depois: marcar o produto demonstrativo, informar o WhatsApp com país/DDD, salvar, publicar, abrir o link, enviar pedido fictício e conferir a fila. Não abrir/enviar WhatsApp real durante testes sem intenção explícita do usuário.

O CLI pode exigir habilitar APIs e permissões administrativas do provedor. Não houve execução autenticada deste pipeline na nuvem no Work. IAM mínimo, assinatura `signBlob`, upload/miniaturas e expiração efetiva de URLs no GCS precisam ser comprovados nesse projeto. A criação de um recurso não comprova esses testes. Não conceder Owner como atalho para resolver assinatura.

## Validação executada e limites

96 testes Functions e build aprovados. Teste real Auth/Functions/Firestore/Storage Emulator aprovado, exit code 0: duas lojas/dois administradores, upload/miniatura/retry/quota, foto original preservada, publicação licenciada, catálogo sem dados internos, preço adulterado rejeitado, pedido concorrente deduplicado, contato WhatsApp no recibo, fila/status, acesso cruzado negado, suspensão e despublicação. O WebP demonstrativo também foi decodificado como 120 × 120.

O navegador Work não alcançou o servidor local (`ERR_CONNECTION_REFUSED`); a verificação visual desktop/mobile, popup Google e fluxo de formulário real continuam pendentes. Os URLs assinados pelo emulador usam chave fictícia: isso não comprova entrega/expiração GCS. Houve avisos do emulador sobre dispatch de eventos Auth/Storage após as callables; nenhum trigger desses serviços é definido por este módulo e as asserções finalizaram com exit code 0.

Publicação de produção, aprovação visual final, controle antiabuso público/App Check, IAM, custos/alertas reais e limpeza de mídia órfã permanecem gates de liberação. As quotas novas não são teto financeiro do Google Cloud. PR segue draft até a validação real. Share V2 e dados operacionais permanecem preservados.

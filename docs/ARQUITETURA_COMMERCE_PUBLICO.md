# ZenOS Commerce — vitrine CDN, primeira etapa de homologação

## Decisão técnica
Manter o **Firestore como fonte oficial** e o **PDV integralmente intacto**. Publicar catálogo mínimo e imagens numa **Vercel Blob pública**, servido pela CDN. A rota /loja/{apelido} não deve depender de Firebase Authentication. **Visitas e pesquisas no catálogo não devem consultar o Firestore**. Pedidos usarão uma API Node no servidor com validação e idempotência.

## Limites de segurança e custos
- Nenhuma alteração do arquivo src/firebase.js, cache offline, listeners, sistema de estoque, regras de Firestore ou PDV.
- Snapshot deve ser produzido **pelo servidor**, a partir dos documentos oficiais e depois de validar o token do lojista. Não publicar payload vindo diretamente do navegador.
- Leituras Firestore pontuais **somente na publicação** e na confirmação de compra; não consultar Firestore por visita. Fotos/JSON versionados (caching imutável); aliases de slug são resolvidos por objetos públicos cacheados, sem query a banco.
- O contrato criarSnapshotCommercePublico expõe somente informações intencionalmente públicas, sem custo, financeiro, dados de clientes, credenciais ou histórico.
- Checkout API: validar preço/estoque do servidor, rate limit, antiabuso, idempotência de tentativa, contornar reenvios e **não retornar sucesso se o pedido não chegou ao PDV**.
- Não colocar credenciais Firebase Admin nem token de Blob no frontend; manter segredos em Vercel com menor privilégio possível.
- Evitar publicação em cada alteração de estoque: usar controle de frequência e estratégia de indisponibilidade; verificar preço/estoque oficiais na confirmação.

## Etapas obrigatórias
1. **Esta branch:** contrato puro de snapshot e validação + cliente de leitura de JSON por API pública. Sem autenticação Firebase no transporte, sem fallback para Firestore; testes isolados. Nenhum endpoint ativo, checkout ou deploy de código. Não faz publicação automática.
2. **Backend isolado:** Blob pública já está conectada. O GET /api/commerce/catalogo?slug= existe **somente na branch**, não consulta Firebase e lê JSON do domínio Blob validado por ZENOS_COMMERCE_CDN_ORIGIN. Sem origem configurada devolve 503. Falta implementar PUBLICAÇÃO AUTENTICADA (acesso pontual aos dados oficiais, revisão de dados pessoais, upload separado de fotos), antes de utilizar o endpoint.
3. **Pedidos:** criar API protegida, confirmar dados oficiais com acesso mínimo, gravar idempotentemente pedidos no destino já utilizado pelo PDV e validar todo o fluxo.
4. **Piloto Zênite Atacadão:** testar janela anônima, celular, cache, 1/2/3 fotos, preços, alteração de estoque, escolha de entrega/pagamento, pedidos e WhatsApp. Medir leituras antes/depois.
5. **Liberação gradual:** recurso habilitado por loja somente após testes; sem fallback automático que passe a consultar Firestore a cada visita.

## Condições pendentes
- Store público **criado e conectado**: `zenos-commerce-catalogos-publicos` (`store_fKepXWjAeW2ueMrB`), região `gru1`, projeto `zen-os`. A loja ainda não foi publicada. O token de serviço permanece somente no ambiente de servidor.
- É necessária auditoria dos acessos de serviço, das regras reais e do fluxo de pedidos.
- Eventual uso e tráfego de Blob/Vercel têm cobrança conforme o plano; acompanhar faturamento.
- O código desta etapa **não ativa a vitrine pública nova** nem remove o acesso atual. Não fazer merge como se já fosse uma solução completa.

## Reaproveitamento visual
O cliente HTTP isolado retorna `{ idPublico, configCommerce, produtos }` com o mesmo contrato de propriedades do componente aprovado `ZenCommerceStorefront`. Nenhum componente de configuração, personalização, checkout ou PDV foi alterado. Antes do switch público, o novo endpoint deve estar funcional com catálogo publicado e os pedidos aceitos pela API segura. A homologação não deve colocar botões de compra operacionais sem o backend de pedidos.

## Regra permanente
**Não aumentar leituras, não reinstalar listeners, não modificar a persistência, não expor dados privados e não degradar o PDV.**

## Publicador em homologação
- Endpoint POST `/api/commerce/publicar` disponível somente se `VERCEL_ENV=preview` e `ZENOS_COMMERCE_PUBLISH_ENABLED=true`. Sem isso responde 503, inclusive produção.
- Bearer **Firebase ID token do proprietário** validado por assinatura RS256/Google JWK, emissor e audience do projeto oficial; contas anônimas bloqueadas.
- Conta de serviço Vercel `ZENOS_COMMERCE_SERVICE_ACCOUNT_JSON` ainda **não configurada**. Conceder papel mínimo e apenas a esta função de homologação; nunca expor a chave no frontend ou no GitHub.
- Três leituras diretas por publicação (loja, configurações, registro do apelido); sem listener, query de coleção ou novas leituras por visita. Nenhum dado financeiro/privado deve ir ao snapshot.
- Fotos legadas em data URI são convertidas para objetos da Blob pública com hash do conteúdo e limites de quantidade/bytes. Se limite excedido, a publicação falha fechada sem publicar catálogo parcial. As fotos da configuração permanecem preservadas.
- O publicador usa API HTTP de Blob `x-api-version: 13` e token servidor `BLOB_READ_WRITE_TOKEN`. Versão deve ser revisada antes de produção; preferir SDK oficial e cache com versionamento antes da migração definitiva.
- Alteração de apelido: antes da produção, implementar revogação/expiração dos aliases antigos para impedir vitrines obsoletas.

## Checkout API em homologação (sem impacto no PDV existente)
- `POST /api/commerce/pedido`: desativada fora de preview. Precisa simultaneamente de `ZENOS_COMMERCE_CHECKOUT_ENABLED=true`, `ZENOS_COMMERCE_ABUSE_PROTECTION_READY=true` e `VERCEL_ENV=preview`. Até essas condições, responde 503 sem tocar no Firestore.
- Turnstile obrigatório, segredo configurado no servidor e hostname verificado em `ZENOS_COMMERCE_ALLOWED_HOSTS`. Antes de ativar: configurar WAF/rate limit e verificar conformidade das regras de cobrança e uso.
- Uma leitura pontual do alias oficial, transação de **até 3 documentos** (pedido por chave, loja, configurações) e uma criação atômica no caminho atual `lojas/{uid}/pedidos_online/{id}`. **Sem listener, busca de coleção ou alteração no PDV.**
- Preço, promoções, estoque e disponibilidade recalculados do servidor. Carrinho com ID de produto/quantidade; valores enviados pelo navegador ignorados. Pedidos repetidos recebem o mesmo ID, sem duplicar escrita; falha na gravação devolve erro, nunca falso sucesso.
- A leitura oficial usa credencial de serviço `ZENOS_COMMERCE_SERVICE_ACCOUNT_JSON` **ainda não provisionada**. O endpoint não deve ser habilitado em produção antes da auditoria das permissões do serviço e do teste com o PDV.
- Necessário criar a ligação de UI com o Turnstile e modo CDN, e testar a recepção de pedidos em ambiente isolado. Não habilitar checkout público sem essa etapa.

## Prévia HTML isolada, mesmo componente visual
- Arquivo `commerce-homologacao.html?slug=<apelido>` gera uma entrada Vite independente; importa o **ZenCommerceStorefront original**, mesmo CSS, mesma personalização, fotos e cards. O painel `CommerceSolicitacao.jsx` não foi alterado.
- Não importa `App.jsx`, Firebase ou Authentication. O módulo de checkout legado usa importação dinâmica do Firebase **somente se o usuário conclui compra na loja antiga**; nunca é carregado na nova prévia CDN.
- A prévia é **somente leitura** (`isLivePreview=true`): botões de compra inativos até homologar Turnstile/checkout. Não confundir com loja completa em produção.
- Página marcada noindex/nofollow, sem alterar rotas originais; `vite.config.js` inclui segunda entrada preservando `index.html` principal.

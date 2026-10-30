# ZenOS Commerce — Fila privada de pedidos (homologação)

## Proteção de dados e arquitetura
- Catálogo de produtos e fotos: **Vercel Blob público**, reaproveitando a publicação atual, sem mudança.
- Nome, telefone, endereço e pedido: **Vercel Blob privado** separado `zenos-commerce-pedidos-privados` (ID `store_Ub5FhVPSfclqNq5p`, região `gru1`). NÃO colocar PII em Blob público.
- Token Firebase **Auth** do lojista (sessão já existente) verifica identidade assinada via Google JWK no servidor, **sem ler documentos do Firestore**.
- Fila pesquisada por prefixo do UID autenticado. Nunca aceitar UID arbitrário da URL.
- Badge de notificação consulta somente a API da Vercel a cada 30 segundos, quando o lojista está ativo; nenhum listener, getDoc ou getDocs é adicionado.
- Abertura do pedido chama a mesma função `carregarPedidoOnline` do PDV, com confirmação para não perder venda em andamento; a finalização da venda mantém as validações existentes.
- Marcar como atendido: arquiva em Blob privado ANTES de remover o arquivo da pasta pendente, com confirmação do operador.

## Integração de pagamento
Pagamento continua **no caixa**. A intenção de meio de pagamento enviada pelo consumidor não confirma o recebimento nem cria venda.
Preços e estoque são verificados no catálogo CDN publicado ao registrar a solicitação; o PDV deve confirmar novamente em vendas reais. O estoque publicado pode estar desatualizado; não prometer reserva automática.

## Ativação — BLOQUEADA ATÉ CONFIGURAR SEGURANÇA
- Criado armazenamento privado, **ainda não conectado ao projeto Vercel** para não sobrescrever a variável `BLOB_READ_WRITE_TOKEN` que abastece as fotos e o catálogo públicos. A conexão deve fornecer token com prefixo de variável personalizado.
- Provisionar em Vercel `ZENOS_COMMERCE_PRIVATE_BLOB_READ_WRITE_TOKEN`, token da store privada, **somente no servidor**; jamais expor em VITE_ ou no repositório.
- Configurar proteção antiabuso por rota em Vercel Firewall (rate limit/bot protection); só depois definir `ZENOS_COMMERCE_INBOX_WAF_READY=true`.
- Definir `ZENOS_COMMERCE_PRIVATE_INBOX_ENABLED=true` (backend) e `VITE_ZENOS_PRIVATE_ORDERS_ENABLED=true` (frontend) apenas após testes reais.
- Antes da ativação, a UI pública continua mandando para WhatsApp e o botão do ZenOS continua abrindo a fila de pré-pedidos existente.
- Nunca fazer merge/deploy de recurso ativo antes de verificar autorização entre tenants, gravação real no store privado, retorno ao cliente e leitura da fila em conta piloto.

## Contenção de custos
Nenhuma leitura extra do Firestore, nem em visitantes, nem por badge. As chamadas de consulta da fila serão cobradas pela Vercel Blob. Há limite de 80 pendentes por página; paginação/volume precisa ser ampliado antes de atender uma operação com dezenas de pedidos simultâneos.

## Estado atualizado
- Proteção Vercel WAF aplicada e confirmada: **15 POST/minuto por IP** em `/api/commerce/inbox`, sem alterar outras rotas.
- `ZENOS_COMMERCE_INBOX_WAF_READY=true` definido para preview e produção, mas **a fila continua desativada** porque faltam credencial privada e ativação explícita.
- Na conexão manual do store privado existente ao projeto ZenOS, usar prefixo de variável exclusivo `ZENOS_COMMERCE_PRIVATE_` de modo a criar `ZENOS_COMMERCE_PRIVATE_BLOB_READ_WRITE_TOKEN`, nunca substituir `BLOB_READ_WRITE_TOKEN` da loja pública. Escolher credencial de leitura/gravação específica da store, não OIDC genérico, até migrar para `@vercel/blob` com OIDC comprovado.
- Reenvio idempotente: repetição da mesma solicitação devolve o protocolo já gravado; reutilização do protocolo com conteúdo diferente retorna conflito.

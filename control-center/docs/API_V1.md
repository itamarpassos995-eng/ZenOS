# API administrativa V1 — estágio de homologação

A primeira camada de API foi implementada **como funções de domínio invocáveis nos testes**, ainda sem endpoints publicados, provedor de sessão ou banco persistente. Depende de um verificador de sessão confiável injetado no servidor e de um repositório SQL.

Rotas planejadas (somente GET):
- `GET /health` — saúde sem dados privados.
- `GET /api/overview` — contagens agregadas de empresas, assinaturas e cobranças vencidas.
- `GET /api/organizations` — lista paginada (limite inicial de 25; cursor na próxima fase).

Não há rotas de escrita, criação de sessões, MFA, conexão real com dados de clientes nem deploy. O guard `verifySession` **não aceita dados fornecidos pelo browser como identidade confiável**: o servidor futuro deverá verificar cookies/tokens assinados, MFA e vínculo administrativo usando provider escolhido.

Isolamento: nenhum endpoint público pode executar a API diretamente sem middleware de sessão e autorização. Acesso administrativo da plataforma deve ser separado do Firebase Auth de lojistas.

Antes da primeira homologação HTTP real: aprovar provedor de login/MFA, provisionar PostgreSQL isolado, implementar verificação de sessão server-side, rate limits, CSRF em operações futuras, limite/cursor, secret manager e testes integrados.

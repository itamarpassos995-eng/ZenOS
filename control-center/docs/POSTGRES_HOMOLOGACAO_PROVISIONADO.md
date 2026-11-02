# Banco de homologação provisionado — 2026-11-02

A instância PostgreSQL 16 exclusiva `zenos-control-center-homologacao` foi criada no Render (workspace distinto do projeto Vercel `zen-os`), plano **free**, região **virginia**, ID `dpg-dbk969g473hc7380nbog-a`.

Dashboard: https://dashboard.render.com/d/dpg-dbk969g473hc7380nbog-a

**Status observado ao criar:** `creating`. **Expiração indicada pelo provedor:** 2026-12-02. Instância gratuita efêmera, NÃO apta para produção de assinaturas sem política de backup, retenção e infraestrutura permanente.

## Garantias e limites
- Nenhuma chave ou senha incorporada ao GitHub.
- Nenhuma conexão Firestore criada, nenhum listener, nenhuma leitura ou gravação em clientes reais.
- Vercel `zen-os`, código da main e prévia pública não alterados.
- Migration `control-center/migrations/001_foundation.sql` validada anteriormente em PostgreSQL descartável por GitHub Actions; **ainda não aplicada** nesta instância real.
- A integração Render disponível permite criar banco e consultas **somente leitura**; não fornece uma ação autorizada para executar DDL. Não declarar migration aplicada enquanto isso não for feito com cliente PostgreSQL autenticado.
- A URI de conexão deverá ser guardada em segredo **apenas no projeto de homologação** e não no frontend. Nunca inserir nas mensagens, commits ou logs.
- Antes de ligar a API HTTP: preparar MFA real, autenticação e verificação do backend, conexão segura TLS, testes de restauração/backup e API privada.
- Ao terminar a homologação, promover dados **apenas por migration** em banco durável aprovado. Não migrar dados de clientes do Firebase.

## Procedimento seguinte
1. Confirmar `available`/ativo no dashboard Render.
2. Obter credencial de conexão por interface de administração segura, não divulgar.
3. Executar migration em transação usando cliente `psql` confiável e permissões mínimas. Conferir schema por SELECT em `information_schema`.
4. Configurar variáveis secretas na Vercel **do Control Center**, jamais em `zen-os`.
5. Implantar serviço com identidade administrativa MFA e backend-only PostgreSQL.

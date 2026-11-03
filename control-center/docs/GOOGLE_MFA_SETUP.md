# Google + autenticador — Control Center de homologação

## Implementado
- Login Google via authorization code com state, nonce e PKCE, troca de código no servidor e validação criptográfica RS256/issuer/audience/expiração/nonce/azp/email verificado.
- Tentativas OAuth de uso único, vinculadas a cookie de navegador e com validade de cinco minutos; PKCE cifrado no PostgreSQL.
- Primeiro owner apenas para o e-mail verificado explicitamente configurado em CONTROL_CENTER_BOOTSTRAP_EMAIL e somente se não existir owner. Identidade vinculada por google:<sub>; nenhum papel vindo do navegador.
- Enrollment manual de TOTP após login Google autorizado. Chave aparece apenas antes de confirmar enrollment, cifrada com AES-256-GCM e contexto por admin no banco. Não se envia por chat.
- Cinco falhas bloqueiam por 15 minutos; contador persistente e lock transacional impedem replay.
- Sessões opacas de uma hora, somente hashes no PostgreSQL; cookie HttpOnly, Secure, SameSite=Lax. Logout revoga sessão no banco. Desativação ou remoção de papéis tem efeito na próxima consulta.
- POST exige Origin exato; MFA também exige token CSRF vinculado ao desafio. CSP, no-store, limites de corpo/tempo e limitação conservadora global de 120 requisições/minuto por processo.
- Painel inicial server-side somente leitura: visão geral e 25 empresas recentes. Sem requisições Firebase ou sincronização de clientes reais.

## Ativação externa pendente
1. Usar serviço separado de homologação, sem assinatura de plano pago. Configuração sugerida: diretório raiz control-center, build `npm ci --omit=dev`, start `npm start`, Node 22. Definir CONTROL_CENTER_BIND para aceitar HTTP da plataforma. Dockerfile opcional neste diretório. Não alterar zen-os na Vercel.
2. Definir URL HTTPS definitiva em CONTROL_CENTER_ORIGIN, sem barra final.
3. Criar cliente OAuth Google tipo Web em projeto administrativo separado do Firebase dos clientes. Redirect URI exato: `<CONTROL_CENTER_ORIGIN>/auth/google/callback`. Escopos: openid e email. Configurar seu e-mail como usuário de teste se o consentimento estiver em modo de teste. Não solicitar Drive, Gmail ou outros escopos.
4. Armazenar GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no gerenciador de variáveis do serviço, nunca no navegador/git/chat. Fornecer CONTROL_CENTER_DATABASE_URL externo exclusivamente do banco `zenos_control_center_homologacao`. Runtime exige TLS com validação de certificado; nunca abrir regra 0.0.0.0/0.
5. Gerar CONTROL_CENTER_AUTH_KEY com 32 bytes aleatórios em base64 e guardar em segredo/backup seguro. Perder ou trocar essa chave sem recifrar as chaves TOTP exige recuperação administrativa. Configurar CONTROL_CENTER_BOOTSTRAP_EMAIL com a conta Google autorizada; remover a variável após o primeiro enrollment bem-sucedido.
6. Aplicar UMA VEZ as migrations 002 e 003 no banco de homologação pelo DBeaver autenticado com TLS. 001 já executada: NÃO repetir. 002/003 não são executadas no startup nem foram aplicadas pelo agente.
7. Abrir a URL, entrar com Google, adicionar chave manual no aplicativo autenticador e confirmar código. Guardar a chave em cofre seguro. O painel começa vazio até receber dados de teste; não há integração automática com clientes nesta entrega.

## Recuperação de MFA
Não há reset público nem bypass por e-mail. Se perder o autenticador e a chave de backup, um administrador de infraestrutura autorizado deve verificar a identidade fora de banda, revogar sessões e desafios e reprovisionar a credencial de MFA de forma controlada no banco. Não apagar apenas enabled ou desabilitar MFA para liberar acesso. Não expor o serviço sem plano de recuperação e guarda segura da chave.

## Validação e limites
`npm ci --prefix control-center` e `npm test --prefix control-center`.
Testes criptográficos usam RSA local e vetores RFC 6238. Integração executa SQL em PGlite (PostgreSQL WASM isolado), com troca OAuth simulada; não comprova configuração real do Google nem conexão ao Render. PGlite possui gen_random_uuid mas não instala o pacote pgcrypto: somente essa instrução de extensão é omitida no teste isolado.

O painel usa HTML server-side inicial; não substitui ainda o visual premium aprovado. Não existem sincronização Firebase, ingestão autenticada exposta, pagamentos, bloqueios de clientes nem atualização quase em tempo real dos dados operacionais. A ativação desses fluxos é outra etapa, mantendo teste grátis imediato e independente.

O runtime de homologação restringe o nome lógico do banco e falha antes de abrir HTTP se faltar configuração ou migration de autenticação. Segredos, códigos OAuth e TOTP não são registrados pelo aplicativo.

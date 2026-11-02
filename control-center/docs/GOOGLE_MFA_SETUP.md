# Google e segundo fator — implementação isolada

## Entregue
- `createGoogleIdentityVerifier`: valida assinatura RS256 com chaves públicas do Google, issuer, audience, expiração, idade máxima, nonce e email verificado. Não concede MFA nem roles.
- `createAdminIdentityResolver`: consulta admin ativo e papéis por subject estável `google:<sub>`, usando SQL parametrizado. Não cria owner automaticamente por e-mail.
- `createTotpSecondFactor`: valida códigos de aplicativo autenticador com janela de 30 segundos, transação e lock no PostgreSQL; impede reutilização e bloqueia após cinco falhas por 15 minutos. Segredo vem de armazenamento exclusivamente servidor.
- Dependências `jose` e `pg` isoladas neste diretório, com lockfile.

## Ainda não ativado
Não existem nesta entrega rotas OAuth/callback, emissão de sessão autenticada, tela de enrollment ou endpoint público de login. Estes componentes são pré-requisitos de segurança, não um login já operacional. O bootstrap atual continua negando inicialização sem adapter confiável.

A migration `002_admin_mfa_state.sql` está apenas preparada, NÃO foi executada. Não repetir `001_foundation.sql`.

## Configuração externa indispensável
Criar um cliente OAuth Google do tipo aplicação Web em projeto administrativo isolado. Definir primeiro a URL HTTPS exclusiva de homologação, para cadastrar o redirect URI exato. Manter Client Secret somente no servidor. Não usar o projeto Firebase dos lojistas.

Depois configurar o fluxo authorization code com state, nonce e PKCE; nonce deve ser gerado pelo servidor e associado a uma tentativa de uso único. Após verificar Google, exigir TOTP e resolver os papéis no PostgreSQL antes de emitir cookie HttpOnly, Secure e SameSite. Desafios e sessões devem ter expiração e armazenamento durável. Códigos e tokens não devem aparecer em logs.

Provisionamento inicial: vincular o subject Google verificado ao admin explicitamente autorizado e provisionar segredo TOTP via canal seguro. Nunca enviar o segredo pelo chat nem aceitar segredo TOTP/roles fornecidos pelo formulário como configuração confiável. Enrollment e recuperação exigem implementação própria antes da ativação.

## Validação
`npm ci --prefix control-center` e `npm test --prefix control-center`.
Testes criptográficos usam chaves RSA locais e vetores RFC 6238. Testes SQL usam adapters simulados; nenhuma conexão ao PostgreSQL real, Firebase ou Vercel é feita pelos testes.

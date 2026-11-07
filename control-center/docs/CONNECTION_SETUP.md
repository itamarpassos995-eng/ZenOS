# Conexão de homologação — próximos requisitos

Código preparado para receber `CONTROL_CENTER_DATABASE_URL` exclusivamente no servidor e um adapter de identidade autenticada (MFA) injetado após verificação do emissor do token. Não existe serviço HTTP implantado nesta etapa: `bootstrapControlCenter` devolve um handler testável, não um endpoint público.

## Pré-requisitos externos pendentes
1. Aprovar/provisionar PostgreSQL **isolado** (nunca o Firebase nem banco operacional); armazenar URI como segredo, em ambiente restrito.
2. Executar `001_foundation.sql` apenas nesse PostgreSQL isolado, com backup/rollback.
3. Definir e configurar provedor de autenticação administrativa com MFA real. Backend deve validar assinatura, emissor, audiência e expiração de sessão, e mapear roles a partir do servidor, nunca de payload arbitrário do navegador.
4. Instalar pacote npm `pg` no projeto Control Center para runtime real; integração em teste usa Pool simulado.
5. Criar API HTTP serverless protegida, com rate limiting, validação, cookies seguros, expiração e logs redigidos.
6. Após teste isolado, configurar a prévia para ler **somente dados de homologação**, mantendo o visual aprovado.

## Garantias atuais
- Sem segredo -> falha fechada.
- Sem provedor de autenticação -> falha fechada.
- Token com claims de MFA mas emissor não verificado -> negado.
- Testes cobrem SQL parametrizado e consultas autorizadas via adapters simulados.
- Nenhuma alteração no fluxo de cadastro/teste grátis do ZenOS.
- Nenhuma conexão ou dado real criado, alterado ou lido.

## Nota de segurança
Nunca passar um `verifyProviderToken` que apenas decodifica JWT sem verificar assinatura/issuer/audience/expiração; a checagem de `issuerVerified` é uma pré-condição e deve ser produzida por autenticação verificável do provedor. O atributo `roles` deverá ser obtido da base administrativa confiável, e não de claims modificáveis do cliente.

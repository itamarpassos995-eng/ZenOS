# Segurança administrativa — especificação de implementação (não ativada)

## Separação de identidades
- A identidade Firebase Auth do lojista **não** é credencial de administração da plataforma.
- Administradores devem autenticar em um provedor server-side com MFA e sessões com cookies `HttpOnly`, `Secure`, `SameSite`.
- Rotas sensíveis validam sessão, status do admin, papéis (RBAC), verificação MFA e autorização sobre o recurso.
- Jamais aceitar flags `validatedByServer`, `mfaVerified` ou `mayAccessTenant` diretamente do navegador; são atributos internos atribuídos **após** a validação da sessão, token e políticas no backend.

## Papéis
- owner: gerencia planos e equipe administrativa;
- billing: cobranças e pagamentos;
- support: solicitações de clientes;
- auditor: somente leitura, incluindo eventos de auditoria.
- Qualquer ação fora da lista explícita deve falhar fechada (`ACCESS_DENIED`).

## Eventos
A validação pura de payload e RBAC em `src/domain` **não autentica o produtor do evento**, não substitui assinatura HMAC / service credentials, não grava PostgreSQL e não pode ser exposta diretamente como endpoint confiável.

## Limites atuais
Nenhuma rota HTTP, autenticação real, MFA, sessão, banco provisionado ou escrita de clientes foi implementada. Antes de abrir APIs, implementar middleware de sessão, proteção CSRF e testes de autorização integrados. O frontend aprovado permanece isolado como demonstração visual.

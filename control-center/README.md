# ZenOS Control Center — homologação isolada

Aplicação administrativa independente dentro desta branch. Não importada pelo Vite do ZenOS, sem alteração no Firebase ou nos dados dos clientes.

## Estado atual
- Fundação `001_foundation.sql`: 17 tabelas confirmadas pelo usuário no PostgreSQL Render de homologação via DBeaver com TLS em 02/11/2026. Não repetir a execução.
- Fluxo Google → cadastro/validação TOTP → sessão → painel somente leitura → logout implementado em `src/server/start.mjs`.
- Validação de assinatura Google, PKCE/state/nonce, MFA persistente com bloqueio/replay, sessões revogáveis e papéis do PostgreSQL.
- Painel inicial com contagens e lista de empresas do PostgreSQL. Não existe sincronização de clientes reais ou requisição Firebase.
- `002_admin_mfa_state.sql` e `003_admin_auth.sql`: preparadas e testadas em PostgreSQL isolado (PGlite), NÃO aplicadas ao Render.
- Código não publicado. Faltam cliente OAuth Google, URL HTTPS separada, secrets do serviço e aplicação das migrations de autenticação.

## Executar
Requer Node 22, configuração servidor conforme `.env.example` e banco EXCLUSIVO `zenos_control_center_homologacao` com as migrations aplicadas. `npm start` nunca aplica migrations.

```sh
npm ci --omit=dev
npm start
```

Para testes: `npm ci` e `npm test`. Testes não conectam Firebase, Render ou Google real. Integração executa SQL em PostgreSQL WASM e simula troca de tokens OAuth; assinatura JWT é testada separadamente com chaves RSA.

Configuração externa e recuperação: [GOOGLE_MFA_SETUP.md](docs/GOOGLE_MFA_SETUP.md).
O Dockerfile é opcional e exige contexto de build `control-center/`. Nenhum plano pago é contratado por estes arquivos.

## Limites
A interface server-side inicial não substitui a prévia visual premium. Não existem ainda ingestão autenticada exposta, sincronização operacional, cobrança automática ou bloqueios de clientes.

A liberação do teste de novos clientes permanece imediata e independente da disponibilidade do Control Center. A central recebe o evento depois, nunca autoriza o início do teste.

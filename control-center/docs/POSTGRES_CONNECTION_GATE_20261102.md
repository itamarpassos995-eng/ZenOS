# Homologação PostgreSQL — estado verificado em 2026-11-02

## Estado confirmado
- Instância `zenos-control-center-homologacao`, ID `dpg-dbk969g473hc7380nbog-a`, PostgreSQL 16 no Render: `available`, plano `free`.
- Vencimento informado: 2026-12-02.
- Ações do GitHub PR #152 (`Control Center Foundation` e `ZenOS Release Protection`) concluídas com sucesso.
- Consulta somente leitura via integração Render falhou: **allowlist de IP vazia impede conexões externas**. Essa é uma barreira de segurança; não deve ser removida indiscriminadamente.
- Não há prova de que a migration `001_foundation.sql` tenha sido aplicada na instância persistente. O teste de migration passou no PostgreSQL temporário do GitHub Actions.

## Opção segura para concluir a instalação
1. Provisionar executor/serviço autorizado na mesma infraestrutura de banco ou um acesso de rede privado/allowlist estrita com IP fixo conhecido (ex.: job efêmero com acesso privado).
2. Guardar credenciais no gerenciador de segredos do executor; **não registrar URL em arquivos, logs, PRs ou chat**.
3. Executar `psql -v ON_ERROR_STOP=1 -f control-center/migrations/001_foundation.sql` com usuário de migration em PostgreSQL de homologação; verificar estado e constraints com `information_schema`.
4. Provisionar usuário distinto com acesso mínimo para leitura da API, separado do owner da migration.
5. Configurar segredo `CONTROL_CENTER_DATABASE_URL` **somente** no projeto Vercel isolado `zenos-control-center-preview`, nunca no `zen-os`.
6. Publicar API somente após autenticação real do administrador, MFA verificado e cookies seguros. A prévia pública atual tem dados fictícios; não incluir endpoint privado nela até autenticação estar pronta.
7. Executar testes de integração com PostgreSQL persistente, monitorar tentativas negadas, backups e limite do free tier.

## Requisitos de produção preservados
- Zero alteração no Firebase, zero listeners adicionais e nenhum dado operacional copiado.
- O teste grátis no ZenOS deve liberar imediatamente, independentemente da central.
- Nenhuma mudança no layout aprovado e uso obrigatório da logo oficial.
- Sem merge, sem deploy do ZenOS oficial, sem bloqueios automáticos de assinaturas.

## Bloqueio atual
Os conectores disponíveis não oferecem execução de SQL de escrita pelo Render nem acesso remoto enquanto a allowlist estiver vazia. Essa restrição deve ser resolvida com um executor seguro, não com exposição pública do banco.

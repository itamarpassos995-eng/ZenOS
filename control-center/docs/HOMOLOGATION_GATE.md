# Gate para conectar a prévia ao banco (não autorizado ainda)

Estado comprovado: migrations e políticas testadas por CI; adapters de PostgreSQL e de sessão existem, mas o serviço HTTP não está implantado e nenhum banco persistente foi configurado.

Antes de publicar endpoints administrativos:
1. Provisionar banco PostgreSQL **independente**, com orçamento e backup aprovados.
2. Criar a identidade administrativa por provedor autenticado com MFA real. NÃO aceitar roles e MFA em headers do cliente.
3. Ajustar `createSessionVerifier` para verificação real de assinatura, issuer, audience, expiração e roles carregados do backend.
4. Aplicar migration somente no banco de homologação e validar concorrência, índices e reversibilidade.
5. Configurar secrets no projeto Vercel exclusivo do Control Center; nunca no `zen-os`.
6. Publicar API com limitação de taxa e sessão em cookie seguro. Revisar autenticação de endpoints GET e depois de escrita.
7. Conectar a prévia visual aos endpoints apenas após validação completa; nunca exibir dados reais no protótipo público.
8. Confirmar identidade visual oficial a partir do arquivo original de logomarca.

O adaptador HTTP neste PR é apenas ferramenta de homologação/teste; não deve ser implantado sozinho, pois o acesso real depende de implementação de provedor de autenticação e do banco. A prévia atual tem apenas dados fictícios.

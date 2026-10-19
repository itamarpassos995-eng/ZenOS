# Liberação em produção — Solicitar Minha Loja Online (sem habilitar Commerce)

**Escopo estrito:** oferecer o botão **Administração → Minha Loja Online → Solicitar ativação**. Este PR NÃO disponibiliza editor, pedidos, loja pública, acesso de operador Commerce nem nenhuma função do PR #63. Todas essas etapas permanecem bloqueadas até testes de produção.

## Funcionamento

- Autenticação Firebase atual do lojista, sem cadastro de nova conta e sem mexer no PIN do terminal.
- A tela é lazy: não carrega nem consulta Cloud Functions enquanto o usuário está no PDV, estoque ou caixa.
- Somente administradores/gerência com permissão `admin` veem o item de menu; o servidor ainda exige `request.auth.uid===lojaId` e que o documento principal da loja exista.
- Consulta via Callable `commerceSolicitacaoCliente`, `southamerica-east1`, actions `consultar` e `solicitar`.
- Gravação **somente** em `lojas/{lojaId}/commerce_solicitacoes/solicitacao` para a **primeira solicitação**, com `status='pendente_analise'` e `habilitado=false`. Clique duplo não regrava.
- Após solicitação, status persistente. Nenhuma ativação de módulo, faturamento, preços, contratos, alterações em V1/V2, migrações, mudanças de regras ou permissões de usuários.
- A resposta da Callable expõe apenas o status e a data, nunca observações internas ou informações de outras lojas. Até um documento com status `ativo` não habilita o Commerce nessa tela.

## PRECHECK obrigatório antes de publicar

1. CI verde do PR de solicitação, incluindo auditoria `commerce-request-release-audit.mjs`, testes de autenticação e build. Verificar que exatamente os arquivos allowlist foram alterados.
2. Conferir política **real** do Firestore de produção para o caminho novo. A regra `firestore.emulator.rules` permite tudo a qualquer autenticado **somente no emulador** e NUNCA pode ser publicada em produção. Confirmar proteção de documentos administrativos: ninguém pode se conceder licença/ativação escrevendo diretamente em `commerce_solicitacoes`. Nenhum código deverá tomar `habilitado` neste documento como fonte de autorização.
3. Conferir funções existentes e gravar lista completa: `fiscalAdministracao`, `fiscalBackendStatus`, `fiscalSolicitacaoCliente` devem permanecer sem mudanças, sem exclusões. Fazer backup e registrar versões (ou artefatos) de deploy.
4. Verificar onde realmente está hospedado **zenos.app.br**. A auditoria listou `zenos-ac6b2.web.app` mas não comprova que o domínio comercial aponta para esse Hosting. **Não fazer deploy de Hosting até comprovar.**
5. Não publicar `firestore:rules`, `storage`, `hosting` nem chamar `firebase deploy` global. Sem alteração em documentos V1/V2.
6. Teste piloto: dono de loja de teste autorizada, pedir duas vezes, recarregar, confirmar somente um registro. Teste de loja diferente deve negar. Verificar PDV, caixa e login em loja real sem tocar suas gravações.

## Sequência em duas etapas (não automática)

**Etapa A — função individual no Firebase oficial, após gates:**

Executar em checkout limpo do commit aprovado, nunca em artefato HML, depois de conferência de credenciais e projeto:

```sh
npx --yes firebase-tools@15.34.0 functions:list --project zenos-ac6b2
npx --yes firebase-tools@15.34.0 deploy --project zenos-ac6b2 --only functions:fiscal:commerceSolicitacaoCliente --config firebase.json
npx --yes firebase-tools@15.34.0 functions:list --project zenos-ac6b2
```

Antes do deploy, conferir a seleção exata e interromper se Firebase CLI pedir exclusão de qualquer função preexistente. A região/código são independentes, mas a codebase é `fiscal`; executar somente a função nova.

**Etapa B — interface:** após confirmação da callable em produção, publicar `src/App.jsx` e `CommerceSolicitacao.jsx/.css` **pelo canal real identificado de zenos.app.br**, com backup da versão anterior e rollback testado. A implantação do frontend não precisa editar qualquer documento de usuário. A alteração de `main` no GitHub por si só não comprova que o site foi publicado.

## Rollback

1. Desativar acesso à tela/menu do pedido de ativação na interface por release de Hosting anterior, **sem reset de sessão**.
2. Se necessário, impedir a criação de novas solicitações pela callable (reverter somente esta função após verificar que não haverá exclusão de outras). Não apagar a coleção de interesses — ela não interfere em PDV/Financeiro.
3. Não restaurar Firestore completo, pois isso perderia gravações reais posteriores.

**Regra:** o Commerce operacional completo continua desativado até release separado, após integração segura do backend, licenças e operador.

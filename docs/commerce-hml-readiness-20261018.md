# ZenOS Commerce — HML Cloud fail-closed (PR dependente do #51)

## Objetivo e isolamento
Ambiente de nuvem autorizado para homologação: `zenos-commerce-homologacao`, bucket `zenos-commerce-homologacao.firebasestorage.app`, Auth `zenos-commerce-homologacao.firebaseapp.com`. Produção operacional `zenos-ac6b2` é **proibida** para testes. Este PR prepara código e testes; não inicia deploy, ativa clientes nem altera regras/IAM no Firebase.

## Bloqueios de inicialização
1. O modo `commerce-hml` não compila sem JSON válido de `VITE_ZENOS_COMMERCE_HML_FIREBASE_CONFIG`, ou com projeto, domínio Auth ou bucket divergentes.
2. A ponte `VITE_ZENOS_COMMERCE_OPERATOR_BRIDGE=true` é proibida em um build de site HML isolado.
3. A entrada React do build `commerce-hml` nunca monta o `App` operacional. Se a configuração estiver ausente no runtime, exibe erro isolado e não executa a aplicação operacional.
4. Em runtime, `commerceFirebaseConfig.js` confere a configuração exata do SDK para evitar project-mix. A prévia Vercel e o script local de SDK também conferem o domínio Auth.
5. O deploy exclusivo de homologação prepara SDK e build local antes de atualizar Functions ou Hosting, diminuindo o risco de implantação parcial por configuração inválida.
6. O deploy completo seleciona explicitamente `commerceSessaoZenOS`, além das Functions Commerce já previstas. **A existência da Function não provisiona credenciais privadas.**

## Comprovação reprodutível sem contas ou rede
```bash
npm ci --ignore-scripts
node scripts/commerce-cloud-hml-safety-check.mjs
node scripts/commerce-cloud-hml-deploy.mjs --check
```
A verificação realiza compilações negativas com JSON inválido, projeto de produção, bucket de produção e ponte operacional ativada, exigindo recusa; depois compila com SDK fictício com identificadores do projeto HML. O teste não acessa Firebase nem utiliza credenciais de nuvem. Também audita deploy fixo e regras cloud deny-all.

## Gates antes de homologar no navegador
- GitHub CI e release gate no SHA mais recente, incluindo emuladores Auth/Functions/Firestore/Storage, devem ficar verdes.
- É indispensável uma sessão autenticada real no projeto **isolado** e contas/loja/produtos **fictícios**. Não usar credenciais de produção nem importar dados reais.
- O site HML, como está, demonstra Studio e vitrine; ainda **não** executa o shell completo PDV do ZenOS na nuvem: `src/firebase.js` usa o projeto `demo-zenos-local` nos emuladores ou `zenos-ac6b2` na produção. A ponte depende do Firebase Auth do mesmo projeto do app operacional; homologação online de PDV exige ambiente operacional isolado com Auth, Firestore e fluxo V1/V2 fictícios, não uma flag no domínio operacional.
- Revisar regras reais de armazenamento de recibos `commerce_faturamentos` contra permissões recursivas sobrepostas, IAM de Functions, Storage, TTL e provisionamento/revogação segura de operadores antes de qualquer ativação. **Não** fazer deploy das regras de emulador.
- Executar pedido de teste ponta a ponta no navegador autenticado (desktop/celular): novo, contador, pré-pedido, revisão, duas abas/operadores, interrupção de rede, cancelar, finalizar uma vez, Share V2, refresh. Construção e emuladores **não equivalem** a esta prova.
- Estratégia de rollback: feature flag desligada, suspender rotas novas e preservar todos os pedidos, documentos, recibos, auditorias e dados existentes; não voltar para código que ignore recibos Commerce.

## Publicação
**Não autorizada por este PR.** A prévia da Vercel, um build bem-sucedido e a implantação isolada não comprovam operação ponta a ponta em produção. Exigir homologação real, revisão da cadeia de PRs #48–#52 contra main e autorização específica de publicação.

# Commerce P5 — isolamento multiloja em emulador

**Não é uma configuração de produção.** O Firestore Emulator legado possuía regras amplas para qualquer usuário autenticado, portanto não comprova isolamento entre lojas. O P5 adiciona regras exclusivas ao arquivo `firebase.commerce.homologacao.json`; o arquivo `firestore.emulator.rules` original permanece intocado.

A regra específica permite acesso apenas a `lojas/{auth.uid}` e seus subdocumentos **exceto `commerce_private`**, que é acessível somente via funções administrativas com checagem de identidade. O Storage continua negando acesso direto a qualquer cliente.

No checkout do repositório, com Node 22, `npm ci` na raiz e em `functions`, Java e Firebase CLI disponível, execute:

```bash
node scripts/commerce-tenant-hml-static-check.mjs
GCLOUD_PROJECT=demo-zenos-local ZENOS_COMMERCE_MEDIA_ENABLED=false ZENOS_COMMERCE_HOMOLOGACAO=true \
firebase emulators:exec --project demo-zenos-local --config firebase.commerce.homologacao.json \
  --only auth,firestore,functions,storage 'node scripts/commerce-tenant-hml-emulator-check.mjs'
```

O segundo teste cria **duas contas e lojas fictícias**, testa leitura e escrita próprias, proibição cruzada, tentativa de ativação de licença pelo navegador, bloqueio direto do Storage e validação da função Commerce com revisão de rascunho. **Os testes unitários e de leitura estática não equivalem a esta execução real.**

Em caso de falha, mantenha o PR draft. O bloqueio de permissões dos operadores, assinatura de URLs para mídia e bucket real continuam pendentes. Nunca executar `firebase deploy` com estes arquivos; nunca selecionar o projeto operacional `zenos-ac6b2`. O Storage permanece desligado por padrão e não foram criados bucket, cobrança, checkout ou publicação de lojas reais.

# ZenOS Commerce — Plano de homologação segura do Storage (P4)

## O que foi preparado

- Configuração **EXCLUSIVA para emuladores**: `firebase.commerce.homologacao.json`.
- Regras de Storage `storage.commerce.homologacao.rules`: **nega todas as operações diretas pelo navegador**, inclusive as autenticadas. Somente a Cloud Function com Firebase Admin pode operar na mídia após a validação de loja e produto.
- A função `commerceMidia` aceita imagens apenas se `ZENOS_COMMERCE_MEDIA_ENABLED=true` **e** `ZENOS_COMMERCE_HOMOLOGACAO=true` **e** projeto/bucket explicitamente autorizados. Projeto operacional `zenos-ac6b2` e bucket operacional são sempre bloqueados pela validação de homologação.
- A tela `Commerce Studio` só informa mídia disponível após a mesma validação, evitando botões ativos sem capacidade de upload.
- **Nenhum bucket na nuvem foi criado aqui.** Criar requer acesso administrativo ao Firebase/GCP de um projeto de testes distinto, confirmação de cobrança e permissões IAM. Este pacote não acessa contas na nuvem.

## Como executar no computador de homologação

1. Na cópia do repositório, com Node 22 e Firebase CLI disponível, instale as dependências da raiz e de `functions`.
2. Execute os testes puros: `node scripts/commerce-storage-hml-check.mjs` e `node scripts/commerce-media-p3-check.mjs`.
3. Inicie os emuladores **sem conectar à produção**:

```sh
firebase emulators:start --project demo-zenos-local --config firebase.commerce.homologacao.json --only auth,firestore,functions,storage
```

4. Somente no terminal que inicia as Functions EMULADAS, configure os valores de TESTE locais:

```text
ZENOS_COMMERCE_MEDIA_ENABLED=true
ZENOS_COMMERCE_HOMOLOGACAO=true
ZENOS_COMMERCE_STORAGE_BUCKET=demo-zenos-local.appspot.com
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
GCLOUD_PROJECT=demo-zenos-local
```

   Atenção: o Firebase Emulator exporta configurações do projeto; não sobrescreva o projeto de produção em consoles reais. Nunca publicar essas variáveis no frontend.

5. Validar com duas contas de teste distintas: uma loja não pode ver, assinar, anexar ou excluir imagens da outra. Testar mídia inválida, metadados adulterados, replay, expiração, quota, arquivos órfãos e colisões.
6. Confirmar que **cliente Web SDK** não pode ler nem escrever qualquer objeto do bucket, mesmo autenticado; Admin da Function deve continuar limitado pelas verificações de loja/produto. As regras de Storage não protegem chamadas Admin.

## Próxima etapa, ainda NÃO executada: bucket real isolado

Criar um **novo projeto Firebase/GCP para homologação** (não `zenos-ac6b2`). Criar nesse projeto um bucket GCS privado nomeado `zenos-commerce-hml-<id-do-projeto>` (a região, o armazenamento e o nome final dependem das opções disponíveis). Desativar acesso público por IAM e aplicar regras explicitamente auditadas. Configurar orçamento/alertas de custo, IAM com privilégios mínimos, CORS somente se necessário, quotas/limites de upload e revisão de assinaturas GCS; os URLs assinados são portadores de acesso durante o prazo.

Assegurar `ZENOS_COMMERCE_MEDIA_ENABLED=true` e `ZENOS_COMMERCE_HOMOLOGACAO=true` **apenas nas Functions desse projeto isolado** após revisar IAM e credenciais. Verificar se serviço de assinatura `getSignedUrl` funciona com conta de serviço autorizada; o emulador não valida permissões IAM do Google Cloud.

**Não usar `firebase deploy` sem selecionar explicitamente o projeto de homologação.** O `firebase.json` principal aponta para regras de Firestore destinadas exclusivamente ao emulador; implantar a partir da configuração errada pode sobrescrever regras reais.

## Gate para merge/publicação

PR continua draft. Não ativar loja pública, pagamentos ou comércio real. O CI e testes puros são requisitos, mas NÃO substituem ensaios reais com Auth/Functions/Storage emulador, isolamento por operadores/lojas, controle de custo e revisão de política Firestore e de assinaturas de URLs. O login Firebase é compartilhado por operadores e não prova autorização de gerente server-side; isso deve ser resolvido antes da produção.

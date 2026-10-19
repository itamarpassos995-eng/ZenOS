# ZenOS Commerce Premium — liberação controlada para produção

**Data da auditoria:** 19/10/2026  
**Repositório:** `itamarpassos995-eng/ZenOS`  
**Produção:** Firebase `zenos-ac6b2`, domínio comercial `zenos.app.br`  
**Homologação exclusiva:** `zenos-commerce-homologacao`  
**Objetivo:** promover com segurança a experiência validada no PR #63, sem regressão no ZenOS atual e sem tocar dados empresariais V1/V2.

> **ESTADO: BLOQUEADO PARA DEPLOY.** Este documento não autoriza deploy, alterações de regras, migração, regravação de V1/V2, alteração de PINs, caixa ou estoque.

## 1. Evidências da auditoria de produção (informadas pelo proprietário)

A execução **somente de leitura** do Firebase CLI para `zenos-ac6b2` retornou:

- Três funções publicadas: `fiscalAdministracao`, `fiscalBackendStatus`, `fiscalSolicitacaoCliente` (Gen 2, Node.js 22, `southamerica-east1`).
- Um Hosting listado: `zenos-ac6b2`, URL `https://zenos-ac6b2.web.app`.
- **Nenhuma função Commerce listada**. A ausência dessas funções impede considerar a integração pronta na produção.
- Terminal em **detached HEAD** `7ce12a970e0e16667045512e24a83036473474ab` (commit do PR #63, homologação), com artefatos `.firebase/` e `dist-commerce-operational-hml/` não rastreados. **Não usar esses artefatos na publicação oficial.**

Verificado no GitHub:

- `main` ainda contém somente as três exports fiscais em `functions/src/index.js`, sem componentes `ZenCommerce*.jsx` nem navegação Commerce em `src/App.jsx`.
- A branch do PR #63 está **214 commits à frente de `main`**. Merge integral traz dezenas de alterações não homologadas para produção; **proibido merge direto**.
- PRs #61, #62, #63 permanecem *draft* e não mesclados.
- `functions/src/commerceStorageSafetyCore.js` da homologação bloqueia explicitamente `zenos-ac6b2`; remover o bloqueio ou configurar `ZENOS_COMMERCE_HOMOLOGACAO=true` em produção **não é solução aceitável**.
- A ponte operador/PIN depende de credenciais privadas provisionadas por servidor; o documento de integração admite que ativação e revogação ainda exigem finalização.
- A leitura do Commerce distingue legado, shadow, V2 certificado e manutenção, recusando V2 inválido **sem fallback silencioso**. Essa proteção é obrigatória.

## 2. Escopo do pacote de produção

**Separar três contratos:**

1. **Backend Commerce de produção:** definir media bucket real, regras mínimas e políticas IAM próprias, sem importar configuração fictícia/HML. Implementar provisionamento e revogação autorizados de contas de operadores quando o lojista habilitar o módulo, sem nova conta Firebase para o cliente. Funções independentes das 3 funções fiscais existentes. Não alterar codebase `fiscal` sem prova de seleção exata das funções e inexistência de exclusões.
2. **Integração ZenOS:** manter `src/App.jsx`, V1, PDV, comissão, fiado, caixa, timestamps, pré-pedidos e fluxo financeiro originais. Adicionar Commerce apenas sob **feature flag de servidor por loja**, default `false`. Nenhum menu/ponte/contagem externa deve consultar novo backend para loja sem licença ou antes de a flag ser ativada. Nunca ativar via configuração editável do cliente.
3. **Interface premium:** portar os componentes do PR #63 e suas dependências expressas para um branch de produção originado de `main` — **nunca merge em bloco dos 214 commits**. Evitar reconfigurar `src/firebase.js` ou reescrever `src/core/operationalRepository.js`.

## 3. Gates obrigatórios antes de qualquer deploy

- [ ] Registrar hash da versão atual realmente publicada (Hosting release) e manifest da versão `main` que a gerou. Conferir configuração, domínio e site de deploy.
- [ ] Snapshot/backup verificável e restaurável das **configurações/rules e coleções pertinentes**; nenhum backup genérico alegado sem evidência. Comprovar rollback funcional de Hosting e backend em ambiente isolado.
- [ ] Produção `zenos-ac6b2` e homologação `zenos-commerce-homologacao`: projectId, bucket, Auth, URLs, flags e endereços separados com bloqueio em caso de divergência.
- [ ] Implementar contrato de licença e ativação servidor por loja; default off. Nunca permitir migração/cópia automática de cadastros nem oferecer acesso compartilhado a outra loja.
- [ ] Homologar integração V1 e V2 com legado/shadow/V2 certificado, store `storage_control`, falha de leitura, tombstone e manutenção; **não gravar em V1/V2 pelo Commerce**. Testar com dados sintéticos.
- [ ] Verificar transações idempotentes de pedido e faturamento com dois operadores/duas lojas; jamais gerar venda/estoque/caixa automaticamente ao receber pedido e nunca duplicar venda.
- [ ] Testar login, troca/revogação de operador e PIN, clientes cadastrados, imagem/banner, catálogo, pedidos, PDV, fiado, caixa aberto, histórico, comissões, celular, refresh e reconexão.
- [ ] Executar CI completo de Commerce e proteção da `main` sobre o **commit exato do futuro release**, não apenas o PR de homologação.
- [ ] Implementar teste de produção **somente de leitura**, depois implantar novo backend inativo, validar callable denied a lojas sem licença; liberar interface com flag desligada.
- [ ] Ativar piloto exclusivo numa loja **explicitamente autorizada**; validar o pedido e o PDV manualmente, observar falhas/permissões e regressões; ampliar somente após aprovação.
- [ ] Definir rollback: flag off imediatamente; restaurar Hosting release anterior sem migração de dados; desativar novas funções separadas quando seguro. Registro de versões e hora de cada etapa.

**No-go absoluto** em caso de: CI não verde, código HML apontando para produção, credenciais de operador não provisionadas, divergência de leituras V1/V2, qualquer mudança de Firestore rules não revisada, checkout duplicado, alterações inesperadas no PDV ou backup/rollback não testados.

## 4. Ordem de publicação, SOMENTE após gates

1. Publicar novas funções Commerce numa unidade isolada e restrita, com **todas as lojas desativadas**. Não publicar rules/Storage/Hosting no mesmo comando.
2. Validar identidade e acesso negativo do servidor, observabilidade e estabilidade fiscal/PDV.
3. Publicar Hosting do ZenOS com **feature flag desligada**, preservar release anterior e conferir smoke tests V1 e V2. Confirmar que a interface antiga funciona antes de liberar recurso.
4. Habilitar Commerce apenas para loja piloto autorizada por configuração segura de servidor.
5. Testes reais de ponta a ponta com autorização do lojista, observação de logs e de reconciliação sem alteração inesperada.
6. Avançar gradualmente. Qualquer divergência => bloquear pela feature flag e iniciar rollback; **nunca restaurar Firestore às cegas**, pois isso apagaria vendas legítimas posteriores.

## 5. Próxima tarefa de engenharia

Criar uma branch **nova a partir da `main` atual**, contendo apenas a integração incremental e dependências auditadas. Adicionar testes de negativa de acesso, smoke de compatibilidade e rollback; não confiar na homologação como certificação de backend produtivo. Só depois propor PR de código e pipeline específico de deploy com `--project zenos-ac6b2` fixado e allowlist de recursos.

O Cloud Shell atual em detached HEAD é **somente origem de evidência**, não uma base segura para publicar.

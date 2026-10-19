# Commerce HML — prévia abre, mas botão Salvar não persiste

## Diagnóstico
Na homologação op-hml-19 o editor exibiu produtos A e B em memória, mas a publicação ficou desabilitada e salvar não retornou confirmação. A listagem de Cloud Functions apresentada anteriormente mostrou `commerceStudio`, `commerceMidia`, `commercePedidosAdmin`, `commerceLoja`, `commerceHmlBootstrap`, mas **não** `commerceSessaoZenOS`. O fluxo integrado chama essa função no login do operador e exige sessão privada antes de consultar/salvar o rascunho. Sem ela, o portal renderizava uma prévia editável com `data=null`, sem callback de salvamento.

A ausência remota precisa ser confirmada novamente por `functions:list` antes do deploy; a falta da função é uma causa estrutural sustentada pela listagem anterior, não é prova de que não existem outras falhas.

## Mudança
- Em ambiente **exclusivamente HML operacional cloud**, não renderiza o editor se `commerceStudio:consultar` não confirmou a sessão. Mostra erro explícito ao invés de permitir alterações não salváveis.
- Só considera um rascunho salvo quando o backend retorna revisão estritamente maior e status `rascunho_privado`, `publicado:false`.
- Script separado `scripts/commerce-hml-session-deploy.mjs`: check offline; deploy exclusivo `functions:fiscal:commerceSessaoZenOS` com projeto, conta, flags, configuração e checks canônicos; nunca faz deploy de rules, Hosting live ou outras funções.
- Testes UI para bloqueio sem sessão e salvamento confirmado, e preflight no CI.

## Aprovação e execução — somente após CI verde
No Cloud Shell com a conta Firebase HML já autenticada e o checkout no SHA aprovado:
1. Consultar `npx --yes firebase-tools@15.34.0 functions:list --project zenos-commerce-homologacao --account itamarbenit@gmail.com`.
2. `node scripts/commerce-hml-session-deploy.mjs --check`.
3. `node scripts/commerce-hml-session-deploy.mjs --deploy-session` (Somente uma função. Se o CLI sugerir remover outras, cancelar).
4. Confirmar `functions:list` e presença de `commerceSessaoZenOS` na região esperada.
5. Preparar SDK `node scripts/commerce-cloud-hml-frontend.mjs` e publicar **somente** preview curto `node scripts/commerce-operational-hml-preview.mjs --publish-short-preview` para disponibilizar aviso de erro.
6. Abrir prévia, sair do terminal e entrar **novamente** com operador A e PIN de teste, para solicitar sessão Commerce pela função agora publicada.
7. Salvar um rascunho privado de dois produtos, verificar retorno de confirmação/revisão e recarregar para confirmar persistência. Não publicar nem faturar ainda.

Não usar main, nem projeto produtivo `zenos-ac6b2`, não abrir caixa, não alterar licença manualmente, não recriar operadores, não limpar banco. Se erro persistir, colher mensagem exata de alerta e logs não sigilosos antes de qualquer outra ação.

# Commerce — verificação Work em 16/10/2026

Base inspecionada: 77df4a8b49df0f2c19215e5072a734f65fc9fd94, PR #30 draft.

## Resultados executados
- npm ci na raiz: aprovado; Functions não tem lockfile, instalado com npm install --package-lock=false.
- node --test functions/test/*.test.mjs: 90 testes aprovados.
- commerce-images-check: 41 verificações aprovadas.
- commerce-media-p3-check: 36 verificações aprovadas.
- commerce-premium-v2-check: 46 verificações aprovadas após substituir a referência ao protótipo HTML ausente por contratos do editor React atual.
- commerce-storage-hml-check: 32 verificações aprovadas.
- commerce-tenant-hml-static-check e commerce-studio-server-check: aprovados.
- npm run build: aprovado; aviso de bundle maior que 500 kB.
- Acrescentado teste concorrente de duas gravações da mesma revisão: exige uma aprovação, uma rejeição aborted e isolamento da revisão da loja B. Ainda não executado em emulador.

## Bloqueios verificáveis
- Firebase CLI 15.34.0 instalado. login:list retornou: No authorized accounts.
- Java disponível: OpenJDK 17.0.20. emulators:exec recusou inicialização: firebase-tools no longer supports Java version before 21.
- Nenhum teste integrado de isolamento, upload ou assinatura foi aprovado nesta execução.
- Plugin Firebase instalado, mas sem ferramentas MCP administrativas expostas nesta sessão.
- Não houve criação de projeto, bucket, IAM, orçamento ou ativação de faturamento.

## Auditoria de autorização
As callables commerceStudio e commerceMidia usam request.auth.uid como identidade da loja, rejeitam lojaId enviado pelo cliente e verificam existência da loja; upload também exige produto cadastrado. Isso NÃO identifica o operador: a sessão Firebase compartilhada permite chamar o backend independentemente do menu. Não existe autorização administrativa individual comprovada. Bloqueio obrigatório antes de liberação. Não conceder claim administrativa à conta compartilhada como solução, pois todos os operadores herdariam a permissão.

## Avaliação das regras exclusivas do emulador
{"score":2,"summary":"Isolamento por UID presente, mas autorização administrativa individual não demonstrada; regras de homologação não são regras de produção.","findings":[{"check":"Authority Source","severity":"major","issue":"Sessão Firebase compartilhada não distingue gerente e operador nas callables Commerce.","recommendation":"Exigir identidade individual verificável no servidor e testar operador negado/administrador permitido."},{"check":"Type Safety / Storage Abuse","severity":"minor","issue":"Regras de homologação permitem escrita ampla da própria loja fora de commerce_private; não validam schema nem tamanho.","recommendation":"Manter regras exclusivas de emulador; não usar como política de produção."}]}

## Próximas validações obrigatórias
Executar emuladores com Java 21; autenticar conta administrativa para criar projeto separado; confirmar viabilidade do bucket sem ativar cobranças. Validar IAM/signBlob, upload e miniaturas, URLs expiradas, leitura direta negada, referências cruzadas, persistência após reload e interface desktop/mobile. Nenhum emulador prova IAM nem expiração real de URL GCS.

Produção zenos-ac6b2 não acessada. Share V2 e dados operacionais não alterados. Sem merge ou deploy.

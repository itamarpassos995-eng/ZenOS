# Commerce — homologação Work, 16/10/2026

## Resultado atual
Auth + Firestore + Functions + Storage Emulator executados com sucesso (exit code 0), com mídia ligada e desligada. Projeto exclusivamente demo-zenos-local. Produção e Share V2 sem alterações.

### Verificações integradas aprovadas
- Duas contas/lojas fictícias distintas, leitura e escrita próprias.
- Leitura/escrita cruzadas negadas.
- Rascunho e licença privados inacessíveis pelo SDK do navegador.
- Tentativa de definir lojaId na callable rejeitada.
- Rascunho persistido e recuperado; revisão da outra loja preservada.
- Duas gravações concorrentes na mesma revisão: uma aceita, outra aborted.
- Upload WebP e miniatura via callable, retorno privado.
- Retry do mesmo arquivo reutiliza o caminho.
- Leitura direta do Storage negada para ambas as lojas.
- Produto inexistente e imagem inválida rejeitados.
- Galeria recuperada do rascunho com URLs assinadas.
- Referência da mídia da loja A rejeitada pela loja B.
- Foto de origem cadastro salva em caminho separado e recuperada.
- Campo imagem operacional preservado após upload e gravação do rascunho.
- Prazo retornado da URL próximo de 30 minutos. Expiração efetiva no GCS não simulada.

Saída final:
```
PASSOU: upload/miniatura privados, retry, persistência, foto cadastro, URLs com prazo e rejeição cruzada. IAM/expiração GCS real não simulados.
PASSOU: lojas A/B isoladas, Store privado, Storage negado e callable com revisao.
Script exited successfully (code 0)
```

## Ambiente e reprodutibilidade
Firebase CLI 15.34.0; Java 21 obtido e extraído em /tmp; Node 24 utilizado pelo emulador, com aviso de diferença do runtime alvo Node 22.
O Work bloqueia Unix sockets; adaptado SOMENTE o CLI instalado fora do repositório para usar sua classe TCPConn em loopback na comunicação entre emulador e worker. Nenhuma regra ou verificação de autenticação do Firebase foi removida. Em computador sem essa restrição, usar CLI padrão.

Assinatura local usou chave RSA fictícia gerada em /tmp, sem conta de serviço real e sem autorização de nuvem. Não commitada. Para reproduzir o bloco de mídia, usar credencial de assinatura fictícia local via GOOGLE_APPLICATION_CREDENTIALS, ZENOS_COMMERCE_MEDIA_ENABLED=true, ZENOS_COMMERCE_HOMOLOGACAO=true e ZENOS_COMMERCE_STORAGE_BUCKET=demo-zenos-local.appspot.com. Os hosts de emuladores são configurados pelo emulators:exec. Nunca usar credenciais de produção.

Comando de teste:
```sh
firebase emulators:exec --project demo-zenos-local --config firebase.commerce.homologacao.json --only auth,firestore,functions,storage 'node scripts/commerce-tenant-hml-emulator-check.mjs'
```

## Outras validações
- Build aprovado.
- Functions: 90 testes aprovados.
- Imagens P2: 41 verificações.
- Mídia P3: 36 verificações.
- Premium V2: 46 verificações; corrigida referência a HTML ausente para validar contratos do editor React atual.
- Storage: 32 verificações.
- Checagens estáticas de isolamento e servidor aprovadas.
- CI do commit e36e5cd: Caixa P0 success (38898159560), Fiscal success (38898159492).

## Pendências reais
1. Autenticação Google concluída na conta administrativa correta. Projeto separado criado: zenos-commerce-homologacao, nome ZenOS Commerce Homologacao, plano Spark, interface confirma Sem custos (US$ 0/mês). Gemini e Analytics opcionais desativados na criação. Login do CLI continua independente, ainda não concluído.
2. Proprietário autorizou habilitar faturamento SOMENTE na homologação. Plano Blaze confirmado no console após confirmação financeira pelo proprietário. Selecionada conta existente “faturamento zenos”, com orçamento de alerta de R$ 20 configurado no fluxo; o alerta NÃO é teto de gasto e sua criação independente no Cloud Billing ainda precisa de verificação. Bucket criado: zenos-commerce-homologacao.firebasestorage.app, localização US-EAST1, classe Standard. Regras publicadas allow read, write: if false. Simulador do console negou leitura anônima e autenticada com UID fictício loja-teste. Isso não substitui auditoria IAM nem teste de upload da Function real.
3. Login Firebase compartilhado entre operadores: as callables ainda identificam a loja, mas não comprovam autorização administrativa individual. Bloqueio de liberação; não resolvido pelo menu nem pelos testes entre lojas.
4. IAM/signBlob e expiração efetiva de URLs exigem GCS real; não são comprovados pelo emulador.
5. Falta teste funcional do fluxo completo de interface desktop/mobile no ambiente conectado.

PR permanece draft. Sem merge, deploy de produção, checkout ou pagamentos reais.

## Continuidade de infraestrutura — 16/10/2026
O backend agora reconhece exatamente o par projeto zenos-commerce-homologacao / bucket zenos-commerce-homologacao.firebasestorage.app. Nomes parecidos e bucket de produção continuam rejeitados. 36 verificações Storage, 36 verificações P3 e 90 testes Functions aprovados após o ajuste.

Bloqueio de ambiente observado: tanto Cloud Shell embutido (shell.cloud.google.com) quanto console Google Cloud (console.cloud.google.com) retornaram “Site Unavailable / Unable to access this site” neste navegador Work. Sem execução de comandos administrativos na nuvem, auditoria de IAM/signBlob ou deploy das Functions. Não é falta de autorização do proprietário. O CLI local segue sem sessão administrativa; o login de navegador não autentica automaticamente o CLI.

Projeto de produção, cadastros e dados operacionais não modificados. PR continua draft. Autorização individual de operadores, quotas de upload no servidor e homologação completa da UI permanecem pendentes.

## Atualização — autorização individual no servidor

Implementada autorização por conta Firebase individual verificada, distinta do UID compartilhado da loja. Cada chamada de Studio e mídia consulta o vínculo administrativo privado `commerce_operator_access/{uidIndividual}`. Login compartilhado, papel enviado pelo cliente, conta anônima, vínculo ausente/inativo e papel de operador não concedem acesso. O rascunho registra o UID individual. Frontend usa sessão Google secundária em memória, sem substituir o login do ZenOS; sair do módulo/trocar operador encerra essa sessão. Detalhes em `docs/commerce-operator-authorization.md`.

Validação desta atualização:
- Build aprovado; 92 testes Functions aprovados (incluindo dois novos testes de autorização).
- Premium 46, imagens 41, mídia 36 e Storage 36 verificações aprovadas; checagens estáticas de servidor e isolamento aprovadas.
- Auth/Functions/Firestore/Storage Emulator reexecutados com mídia desligada e ligada, ambos com exit code 0. Duas lojas e dois administradores individuais verificados. Permissão de operador comum negada para consulta e upload. Revogação aplicada na chamada seguinte. Leitura/escrita da coleção de autorização pelo cliente negadas; tentativa de autoautorização bloqueada.
- Upload, miniatura, retry, concorrência do rascunho, referências cruzadas e preservação da imagem operacional continuam aprovados.
- Assinatura usa chave fictícia exclusivamente local; IAM/signBlob e expiração efetiva no GCS continuam pendentes.

O proprietário confirmou via CLI o acesso à API Cloud Functions do projeto `zenos-commerce-homologacao`; a listagem retornou `No functions found`, coerente com nenhuma implantação realizada. O console no navegador Work voltou a exigir autenticação; nenhum recurso novo foi implantado nesta atualização.

Pendências atuais: reautenticar o console, configurar Google Auth e domínio da homologação, provisionar vínculos individuais fictícios e Firestore com regras de nuvem auditadas, validar popup desktop/mobile e integração real com GCS. A implementação server-side de autorização está testada em emulador; a homologação de navegador/Google ainda não foi demonstrada. Quotas/limpeza de órfãos, IAM mínimo e custos permanecem pendentes. PR segue draft; nenhuma alteração em produção ou Share V2.

## Implantação exclusiva de homologação preparada

CI do commit `ffc555e`: Caixa P0 aprovado (38922818804) e Fiscal onboarding aprovado (38922818551).

Adicionado `scripts/commerce-cloud-hml-deploy.mjs`, com projeto, conta administrativa e seleção das duas funções Commerce fixos. Usa `firebase.commerce.cloud-hml.json`, sem configurações de regras/Hosting; não utiliza `firebase.json` nem implanta funções fiscais. O predeploy também recusa GCLOUD_PROJECT diferente da homologação. O script cria somente o arquivo de ambiente específico desse projeto, ignorado pelo Git, e recusa sobrescrever configuração divergente. A mídia é habilitada exclusivamente no bucket de homologação previamente autorizado. Upload continua dependendo da autorização individual no servidor.

Checagens executadas: modo `--check` aprovado; argumento para projeto de produção recusado; variável de predeploy com projeto de produção recusada. Conferidos no código do Firebase CLI 15.34.0 o formato do filtro codebase/função e a variável GCLOUD_PROJECT fornecida ao predeploy. **Nenhuma implantação na nuvem foi executada.**

No PowerShell autenticado do proprietário, na cópia limpa da branch:

```powershell
git pull --ff-only
node scripts/commerce-cloud-hml-deploy.mjs --check
node scripts/commerce-cloud-hml-deploy.mjs
```

Esse comando publica somente o backend Commerce de teste; não torna uma loja pública/comercial. Não resolve sozinho: provisionamento Firestore/Google Auth, vínculos individuais fictícios, IAM/signBlob, testes GCS reais, popup desktop/mobile, quotas e storefront/checkout. O código atual mantém publicação pública e pagamentos desligados. Merge não substitui essas funcionalidades ou a homologação.

## Atualização — escopo escolhido: pedido + WhatsApp

O proprietário escolheu catálogo, carrinho e pedido persistido com atendimento pelo WhatsApp. Implementados backend público/admin, publicação licenciada, vitrine com galeria, formulário/carrinho, idempotência transacional, fila/status e quotas de upload/pedidos. Não cobra online, não reserva estoque nem altera caixa/vendas. A escolha substitui a pendência de gateway nesta primeira versão; não significa pagamento homologado.

96 testes Functions, build e checagens anteriores aprovados. Suite integrada real reexecutada com sucesso (exit code 0), agora cobrindo publicação, catálogo allowlist, preço canônico, concorrência de pedido, acesso cruzado, revogação, limite de upload, suspensão/despublicação e preservação da operação. Emulador não comprova IAM/signBlob/expiração GCS. O navegador Work retornou ERR_CONNECTION_REFUSED ao servidor local; a UI desktop/mobile não foi homologada.

O pipeline de homologação agora inclui Auth Google/anônimo, regras de nuvem deny-all próprias (não emulador), cinco funções Commerce e Hosting isolado. Obtém configuração pública do SDK, compila modo exclusivo e impede a inicialização do App operacional nesse site. Há bootstrap idempotente de dados fictícios, limitado ao proprietário Google verificado e ao projeto de homologação; não sobrescreve registros. O script ainda não foi executado com credenciais reais de nuvem no Work. Guia e pendências atuais: `docs/commerce-pedidos-whatsapp.md`. Produção e Share V2 permanecem intocados.

## Correção de interface e rolagem — 16/10/2026

A loja pública de homologação foi aberta no navegador. O catálogo estava vazio e a rolagem por roda do mouse não avançou. Corrigido o conflito de overflow/overscroll apenas nas rotas Commerce, preservando o CSS operacional. Vitrine recebeu cabeçalho, composição visual, cartões, busca, estados vazios e carrinho refinados; diálogos nativos controlam foco e rolagem. Preferência permanente de revisão antes da entrega registrada em AGENTS.md.

A publicação agora rejeita catálogo vazio e produtos cuja capa original ainda depende de upload privado, também no servidor. Validação local: 97 testes Functions aprovados; 46 verificações premium; checagens de imagens, mídia, Storage e isolamento; build normal e preview aprovados. Suite real Auth/Functions/Firestore/Storage Emulator terminou com exit 0, incluindo rejeição de publicação vazia e isolamento entre lojas.

Limite da evidência: a versão corrigida ainda não foi verificada visualmente no navegador. A prévia Vercel compilou, mas exige login; o navegador remoto recusou arquivos locais por política. Não há aprovação de responsividade, toque, foco ou rolagem após a correção. Os dados fictícios do harness local não representam teste de nuvem. Upload GCS, miniaturas reais e expiração de URLs continuam pendentes.

O proprietário já implantou a versão anterior em Firebase separado. Para atualizar somente commercePedidosAdmin e a interface, no PowerShell autenticado da branch:

```powershell
git pull --ff-only
node scripts/commerce-cloud-hml-deploy.mjs --ui-fix
```

O destino permanece fixo em zenos-commerce-homologacao. Após o deploy, conferir loja e configuração: roda/trackpad, teclado, celular, galeria e carrinho. Nenhuma alteração de produção, merge ou pagamento realizado.

## Banners privados e pedido real de homologação

Proprietário confirmou o fluxo pedido → WhatsApp; print recebido mostra pedido BE322277A4, R$29,90, sem cobrança ou reserva automática. Upload de produto passou após o proprietário habilitar IAM Credentials API e conceder Token Creator à conta de execução sobre si mesma no projeto de homologação. A expiração real de URLs GCS continua sem teste concluído.

Corrigidos upload de banners desconectado e prévia mostrando sempre o primeiro banner. Adicionada ação autenticada enviarBanner na callable existente, WebP/miniatura com quota compartilhada e namespace separado por loja/banner/formato desktop ou mobile. Servidor valida caminho e metadados antes de salvar/publicar/assinar; persiste caminho, não URL temporária; catálogo e configuração renovam URLs a cada consulta. Resposta pública remove os campos internos de caminho dos banners. Não há alteração de regras Storage/Firestore.

Validação: 99 testes Functions, 46 verificações premium, 36 Storage, build Vite e suite real de emuladores aprovados (exit 0). Integração cobre upload desktop/mobile de banner, persistência sem URL assinada, reabertura com assinatura, rejeição de referência de outra loja e outro banner, negação de leitura direta e catálogo com URLs assinadas sem campos de caminho.

Limites: a interface autenticada de banners ainda precisa de verificação visual e upload na nuvem após deploy. Sem alegação de aprovação de mouse/toque/mobile nessa alteração. Deploy isolado preparado: node scripts/commerce-cloud-hml-deploy.mjs --banner-fix (quatro funções Commerce e Hosting; sem regras/Auth/bootstrap/produção).

Notificação automática e importação de pedido no PDV ainda não implementadas. Fila manual já existente não substitui alerta. Continuidade do chat normal e gates do Work registrados em docs/commerce-proximas-etapas.md.

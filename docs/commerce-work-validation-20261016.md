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

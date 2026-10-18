# Integração ZenOS — sessão e fonte operacional

Etapa incremental sobre PR #48. Desenvolvimento apenas. Não é aprovação de produção, contratação ou publicação.

## Comportamento implementado

No build com `VITE_ZENOS_COMMERCE_OPERATOR_BRIDGE=true`, o login normal do operador entrega seu PIN transitoriamente ao backend Commerce. Não existe novo formulário, conta Google adicional ou senha Commerce. O PIN não é colocado em storage, logs ou estado global. A operação normal do ZenOS continua disponível se a autorização Commerce falhar.

`commerceSessaoZenOS` confere identidade Firebase existente (password/Google), PIN PBKDF2 v2 e autorização privada por loja/operador. O servidor limita tentativas a cinco por janela de 15 minutos e cria credencial aleatória com validade de oito horas, retornada apenas em memória. Cada callable valida a identidade da loja, validade, versão e permissão privada atuais. Revogar acesso ou incrementar versão impede uso imediato. Trocar operador/sair da loja limpa a credencial local. Sair apenas do Portal não desloga o ZenOS.

A conta individual antiga permanece exclusivamente compatível com as ferramentas internas de homologação. Não é o fluxo do lojista. O build normal não habilita a ponte sem flag explícita.

## Proteção indispensável na ativação do módulo

O backend de ativação precisa provisionar `lojas/{lojaUid}/commerce_operator_credentials/{operadorId}` com `ativo`, `papel`, `versao`, `pinVersion:2`, `pinSalt`, `pinHash`. Não há endpoint de autoautorização, cópia automática de vendedores ou confiança no papel enviado pelo cliente. Esses documentos e `commerce_operator_sessions` devem ser deny-all para acesso direto do navegador. Alterações futuras de PIN/permissões devem atualizar versão/credencial pelo backend autorizado; isso ainda precisa ser integrado ao gerenciamento de operadores.

**Esse provisionamento é responsabilidade técnica do ZenOS na ativação; o lojista não deve administrar Firebase nem fazer cadastros externos.** Até completar a integração de ativação/gestão de credenciais privadas, a ponte deve permanecer desligada e não ser apresentada como operação final pronta.

Sessões têm `expiresAt` para configuração de TTL antes de habilitar na nuvem. A expiração é conferida em cada chamada independentemente da limpeza. Não há configuração TTL ou permissão real alterada por este PR.

## Leitura canônica de produtos

Novo adaptador somente de leitura segue `storage_control`: legacy/shadow continuam V1; V2 exige certificado completo, geração ready e manifesto de produtos compatível. Tombstones não são reintroduzidos. Erro, modo maintenance ou geração inválida bloqueiam o Commerce sem fallback silencioso para V1. Publicação e checkout leem produtos dentro da transação; catálogo/admin/mídia também respeitam a geração ativa.

Não há migração, atualização de estoque, alteração de preço operacional ou gravação em V1/V2. Limite atual de 3.000 registros e rascunho monolítico continuam pendentes da etapa de paginação/individualização. Consultas de estoque e checkout ainda podem ler todos os produtos selecionados: não certificar custos/escala final antes de otimizar essa etapa.

## Validação

- Testes Functions: PIN correto/incorreto, formato, identidade, validade, versão, revogação e loja cruzada; roteamento V1/shadow/V2, certificados, tombstones e ausência de fallback.
- UI: Portal integrado não oferece entrada Google; desmontar o módulo não encerra login principal.
- Integração sintética Auth/Functions/Firestore/Storage: sessão de operador, credenciais privadas inacessíveis por SDK cliente, revogação, bloqueio por tentativas; V2 com preço diferente de V1, checkout canônico, estoque inalterado e manutenção bloqueada.
- Regressões do PR #45 devem continuar aprovadas. Resultados definitivos registrados no PR; build não comprova fluxo autenticado na nuvem.

## Próximas integrações ainda pendentes

Ativação/provisionamento de operadores no backend; acesso operacional completo à homologação isolada com regras próprias e nenhuma rota de fallback para produção; notificações globais no ZenOS; rascunho PDV com trava e vínculo transacional pedido→venda; comprovantes via Share V2. Não há botão de PDV fictício nesta etapa.

## Custos e rollback

Sem novo fornecedor, projeto ou dependência. Uma sessão gera registros privados e cada chamada integrada lê sessão/permissão; leituras V2 proporcionais aos produtos consultados. Medir e otimizar antes de liberar em escala. Flag desligada desativa o caminho integrado no navegador; revogar versão/ativo bloqueia sessão no servidor. Reverter somente os commits desta etapa mantém pedidos, produtos e operações existentes. Sem merge na main ou deploy de produção autorizado.

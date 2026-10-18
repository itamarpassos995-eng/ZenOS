# Proteção de publicação ZenOS

O workflow `release-gate.yml` executa em todo PR e em cada push à main, sem filtros
de caminhos. O check único `ZenOS Release Gate` só aprova quando os dois jobs
obrigatórios terminam com sucesso. Falha, cancelamento e etapa ignorada bloqueiam.

Cobertura: estoque e devoluções parciais; datas e comissões; compras e custos;
caixa multimoeda; identidade e baixa de fiado; pré-pedidos; rascunho de 30 itens e
retry idempotente; tombstones e intenção mínima de escrita V2; testes de interface;
build de produção; login sintético e integração Firebase local; dois terminais;
backup e recuperação apenas dentro do emulador.

Os testes integrados usam somente `demo-zenos-local` e emuladores loopback.
Não recebem credenciais, dados ou backups de clientes. Nenhum deploy de Firestore,
regras, Functions fiscais ou mudança de estrutura de dados faz parte deste fluxo.

Na Vercel, exigir `ZenOS Release Gate` em Settings > Build and Deployment >
Deployment Checks, exigindo o status `Vercel - zen-os: release` reportado pela ação
oficial da Vercel no job final. A Vercel pode construir uma versão enquanto
o CI roda, mas só deve associar os domínios oficiais quando o check for aprovado.
Não usar Force Promote para contornar falhas. Um check ausente ou pendente não é
aprovação. A alteração do nome do job exige atualizar a configuração da Vercel.

Reprodução: `node scripts/release-check.mjs`, `npm run build` e emuladores com
`node scripts/release-check.mjs --emulator` (Node 22 + Java 21 no job integrado).
ATT06/ATT061 legados têm comparações textuais obsoletas após tradução da UI;
não são usados como bloqueio, sem remover os testes de comportamento de estoque.

Rollback de frontend identificado: deployment anterior `2wESBjGaGajQBS9W1aQA9bfimDx2`,
commit `b92954e2bdf2fd5672796375ae1757c4d3cbd67a`, menu Instant Rollback da Vercel.
Rollback não restaura nem altera dados e deve ser avaliado conforme o incidente;
esta versão anterior não contém a correção do PDV #44. Não executar rollback de
banco junto com rollback de frontend. A retenção atual de deployments é de 30 dias.

Limites: nenhum conjunto de testes garante ausência de erros. Ampliar cenários
quando surgir um novo incidente. Mudanças no workflow/configuração de proteção
merecem revisão; administradores ainda podem alterar ou contornar essas políticas.

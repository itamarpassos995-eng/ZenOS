# ZenOS Distribuição — continuidade operacional (2026-11-11)

## Fonte de verdade
Repositório `itamarpassos995-eng/ZenOS`; branch **única** `feat/distribution-logistics-foundation`. NÃO alterar `main`, produção, Firebase real, financeiro, estoque ou gates existentes sem homologação. Interface PT/ES, cache e leitura sob demanda.

## Situação comprovada
- Fluxo de carga guiado em 4 etapas; reserva, conferência física, carregamento, romaneio versionado, expedição.
- Usuário testou e confirmou expedição de carga.
- No perfil Gestão de viagens, uma viagem sintética em PYG consta **Programada** com "Condutor de prueba", 3 clientes. Botões Subir/Descer mudam a ordem de paradas (funcionamento correto de REORDER), não iniciam a viagem.
- Em Minha rota, operador motorista vê "Nenhuma viagem neste período", mesmo usando Hoje/Este mês.
- Servidor filtra lista de viagens por `driverId===actor.operatorId` e por `createdAt`. Criar/expedir carga NÃO inicia automaticamente a viagem; apenas motorista designado pode executar `START`.
- Mensagem de bloqueio financeiro PYG na viagem resulta de pedido sem fonte verificável de venda a prazo; NÃO remover esse bloqueio para avançar a viagem. Testar recebimentos somente com fixture permitida.

## Alterações recentes na branch
- `fec8c661`: exibição de ID do motorista vinculado e mensagens claras de estado planejado e REORDER.
- `85df284`: a Central reconhece parâmetros de navegação `motorista` e `viagem` (somente valores com formato validado); pré-seleciona o escopo motorista e o ID de operador. NUNCA passa PIN em URL.
- `c2ed1a99`: ação "Abrir acesso do motorista" em Gestão de viagens planejadas, em nova aba; apresenta detalhes da viagem diretamente com consulta autenticada ao servidor, independente do filtro por data. PIN do operador continua obrigatório e autorização de `routeQuery(detail)` não foi afrouxada.
- Esses commits são alterações de código confirmadas; NÃO alegar testes de browser/Emulator bem-sucedidos sem verificar a CI; Vercel estava pendente quando checado.

## Próxima execução necessária
1. Verificar CI/Vercel da branch; executar `npm run build`, `npm run distribution:phase3`, `npm run distribution:phase3:concurrency` e idealmente `npm run distribution:phase3:browser` no Emulator.
2. Na homologação, em Gestão de viagens abrir viagem programada e clicar "Abrir acesso do motorista"; o link deve abrir login motorista com ID pré-preenchido. Motorista informa seu PIN; a viagem deve aparecer diretamente (incluindo criada em outro dia) e permitir `START`.
3. Se login com PIN não autorizado, corrigir atribuição através de `ASSIGN` sem duplicar viagem.
4. Validar entrega total/parcial, recusa, avaria, retorno e acerto somente em dados sintéticos suportados; não liberar financeiro PYG sem venda a prazo e histórico verificável.
5. Melhoria futura recomendada: lista "Minha rota" deve sempre incluir viagens programadas/em trânsito do motorista independentemente de data, sem listeners Firestore na inicialização e com paginação.

## Restrições
Não reconstruir o módulo. Não criar branch paralela. Não refazer gates G1–G10. Não executar Entrega C fora da autorização vigente. Não afirmar deploy ou homologação aprovada sem status explícito. Continuar a partir destes commits, nunca reiniciar etapas anteriores.

## Correção adicional (2026-11-12)
- Causa comprovada no print: sessão `Minha rota` era do operador `admin`, enquanto a fixture sintética de staging cria operador `driver` (nome `Conductor de prueba`) com PIN SEPARADO fornecido na variável `STAGING_FIXTURE_DRIVER_PIN` durante a provisão. Nunca usar PIN do admin para agir como motorista.
- `bce81348`: na tela de login da staging, ao escolher modo motorista partindo de admin, altera ID sugerido para `driver`, limpa PIN e mantém verificação server-side.
- `25e8ca60`: tela vazia da staging passa a permitir `Entrar como motorista de teste`, efetuando logout operacional e preparando `driver` + `scope=driver`. Ainda exige o PIN separado do motorista. Sem alterações em produção ou permissões.
- Deployment Vercel direcionado ao projeto correto `zenos-distribution-staging`, ID `dpl_6YuVr4KyueDZYmhEGKBqrBMXFhJt`, inicialmente QUEUED. Conferir READY antes de homologação.
- A viagem real da fixture continua `PLANNED`; `START` só poderá ser executado após login como `driver` com PIN válido e consulta autorizada. Sem acesso ao PIN do motorista NÃO há evidência de funcionamento fim a fim. Não pedir que o usuário divulgue o PIN no chat.

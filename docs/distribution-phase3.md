# ZenOS Distribuição & Logística — Fase 3

Continuidade da branch `feat/distribution-logistics-foundation`, base `04c45f36c1056bee6498935a5d14b46bf35a0064`. Sem merge, migração real ou deploy de produção. O ambiente temporário de QA foi encerrado após a coleta das evidências. Este relatório distingue funcionalidades executadas em homologação dos bloqueios de implantação.

## Funcionalidades implementadas

- Viagens agrupam cargas já expedidas e várias entregas. Roteiros e veículos têm revisão, ativação e edição. Placas são únicas; início da viagem trava veículo e motorista transacionalmente até a chegada. Paradas admitem ordenação manual e atribuição antes da partida.
- Motoristas são operadores existentes com `distributionDriver`. Gestão, conferência de retorno e financeiro têm permissões distintas (`distributionManage`, `distributionReturns`, `distributionFinance`; esta última exige também PDV). Somente administrador concede essas permissões, no cadastro de operador existente, por comando autenticado. Não há cadastro paralelo de pessoas, produtos, clientes ou caixa.
- O modo do motorista consulta somente suas viagens, com validação da atribuição em cada comando e consulta. Credenciais, suspensão do módulo e permissões são relidas no servidor; revogação também bloqueia replays.
- Entrega total, parcial, recusada ou não realizada exige validações por linha. Recebedor, identificação, assinatura, observação e horários ficam no evento imutável. Horário do dispositivo é separado do horário de confirmação do servidor. Fotos opcionais dependem de autorização da empresa, têm tamanho limitado e redução automática no aplicativo.
- Comprovante profissional é consultado por evento histórico e impresso em documento A4 isolado, incluindo assinatura e identificação. Não executa emissão fiscal.
- A fila IndexedDB é persistente e separada por empresa/operador. Cada comando mantém sua chave idempotente e revisão esperada. Falha de rede ou perda de resposta preserva a pendência; reconexão repete a mesma chave. Conflitos bloqueiam a fila, sem rebase silencioso. Descarte explícito exige justificativa e arquiva o registro local. PIN e tokens não são persistidos pela fila.
- A interface mantém separados os estados confirmados do servidor e as pendências locais. Uma entrega offline não aparece como entrega confirmada. Não há listener Firestore nem polling no módulo; consultas, paginação, cache e importações são sob demanda. Hoje é o período inicial.

## Retorno físico e estoque

Entrega/recusa registra mercadoria em trânsito; chegada ao depósito apenas muda sua custódia. A quantidade fisicamente conferida precisa ser informada pelo operador autorizado. Só depois disso uma transação reintegra mercadoria sem avaria ao estoque disponível ou destina mercadoria à quarentena. Retornos mistos podem ser separados sem disponibilizar unidades avariadas. Repetições usam o recibo original e não somam estoque outra vez.

Custos e referências de lote existentes são preservados no snapshot original e na auditoria do retorno. O código não inventa um novo saldo por lote: a reintegração atualiza os saldos agregados do V2 existente, preservando a referência de rastreabilidade.

## Acerto e integração financeira

O recebimento do motorista é inicialmente um comprovante de custódia, confirmado pelo servidor, mas ainda sem lançamento financeiro. A conferência compara valores esperados e contados **por moeda**. Divergência exige reconhecimento explícito e justificativa; não cria receita ou despesa automática para esconder diferenças.

Ao conciliar cada pedido:

1. Pré-pedido usa o finalizador comercial do PDV da Fase 2.1, sobre a mesma venda e sem baixar estoque novamente. Saldo não recebido só entra no crediário existente mediante autorização explícita e limite disponível.
2. Venda já finalizada no crediário utiliza o cliente, o livro financeiro e o movimento de caixa V2 existentes. O recebimento reduz dívida e não reconhece receita pela segunda vez.
3. Plano persistido e recibos determinísticos permitem retomar a confirmação após perda de resposta, inclusive entre a liquidação comercial e sua vinculação à viagem. Cada pedido confirma sua própria transação; a viagem inteira só encerra depois de todas as confirmações, conferências e compensações. Não é uma única transação gigante para todas as entregas.
4. Devolução comercial atualiza a venda original, suas devoluções e valores líquidos. A compensação pode abater crediário comprovado ou registrar estorno por transferência autorizado, com referência e moeda original. Não reintegra estoque outra vez. O sistema registra a transferência declarada pelo operador; não transmite pagamento a banco.

BRL, PYG, USD e EUR mantêm suas unidades nativas. O livro existente continua em equivalente BRL com os valores originais e a taxa histórica anexados. Recebimento em moeda diferente do pedido exige consentimento explícito de conversão. Não existe soma nominal de moedas diferentes.

## Homologação e evidências

Passaram 15 testes transacionais novos, 4 testes da fila persistente, 11 assertivas na corrida retorno/PDV, 23 testes de backend das fases anteriores, 19 assertivas de concorrência PDV/Distribuição, 3 testes de interface/impressão, 25 testes de domínio/cliente/contratos (incluindo os 4 da fila), 15 regressões de interface e o build. O navegador da Fase 3 executa 22 cenários; a regressão visual anterior executa 17. Resultados e contagens constam dos arquivos de execução em `distribution-phase3-evidence/`. Os comandos usam exclusivamente `demo-zenos-local`, Auth/Firestore Emulator e empresas `distribution-*` com dados sintéticos. O backend recusa execução fora desse ambiente.

Cenário de navegador real, Chromium desktop 1440×1050 e celular 390×844:

- Gestor cria viagem com três cargas/pedidos no componente integrado da Central.
- Motorista inicia viagem; registra entrega parcial (3 de 5) e total (5 de 5), com assinatura. Quatro comandos de entrega/recebimento ficam offline em fila persistente. A tela continua mostrando o estado confirmado anterior até a reconexão.
- Reconexão confirma os registros; há custódia PYG 119.970 e USD 30,00. Terceiro destino não recebe a mercadoria; uma unidade do segundo destino retorna avariada; uma ocorrência é registrada.
- Motorista consulta/imprime comprovante e registra chegada. Gestor confere 2 unidades boas, 1 avariada e 5 não entregues; reintegra 7 e mantém 1 em quarentena.
- Acerto liquida os três pedidos com o finalizador existente e compensa os retornos no crediário ou por transferência PYG explícita. Viagem encerra; telas e estados são consultados em português e espanhol.

Prova de integridade esperada e verificada diretamente no emulador:

| Registro | Resultado |
|---|---|
| Estoque inicial | 100 |
| Expedição | −15 |
| Reintegração autorizada | +7 |
| Quarentena fora do estoque vendável | 1 |
| Estoque disponível final | 92 |
| Reserva final | 0 |
| Dívida final do cliente | BRL 0 |
| Livro financeiro | 7 lançamentos rastreáveis |
| Receita líquida após devoluções | BRL 210 |
| Custódia por moeda | PYG 119.970 / USD 30,00 |
| Divergências de contagem | zero em cada moeda |

A corrida adicional usa o escritor real `persistV1BusinessOperationSafe` do PDV contra a conferência/reintegração real, sob a cerca V2 do emulador: estoque 5 → expedição 5 → retorno 5 → venda 5 → saldo 0, um lançamento e ordem de origem preservada. Escritas diretas forjadas em viagens, eventos, recibos, planos e reservas financeiras são negadas pelas regras.

Backend também cobre concorrência de comprovantes/recebimentos, repetição, atribuição por empresa, revogação, placa/veículo ocupados, fotos autorizadas e negadas, BRL/PYG/USD/EUR, crediário já finalizado, devolução mista, precisão do estorno, compensações e paginação. Os testes de fila cobrem persistência, perda de resposta, sincronização duplicada e conflito sem rebase. As regressões das Fases 2/2.1 são executadas separadamente.

O campo `netResultBRL` do arquivo de integridade representa receita líquida registrada no livro após estornos, não lucro após CMV.

Links de evidência:

- [Gestão desktop](distribution-phase3-evidence/manager-overview-desktop.png)
- [Motorista mobile](distribution-phase3-evidence/driver-overview-mobile.png)
- [Pendências offline](distribution-phase3-evidence/driver-offline-viewport.png)
- [Viagem encerrada em espanhol](distribution-phase3-evidence/manager-closed-es.webp)
- [Motorista em espanhol](distribution-phase3-evidence/driver-closed-es.webp)
- [Comprovante A4 renderizado](distribution-phase3-evidence/delivery-proof.pdf)
- [Cenários reais do navegador](distribution-phase3-evidence/browser.json)
- [Integridade após encerramento](distribution-phase3-evidence/integrity.json)
- [Backend: 15 testes](distribution-phase3-evidence/backend.log), [corridas e regressões](distribution-phase3-evidence/acceptance.log), [navegador final](distribution-phase3-evidence/visual.log), [domínio e fila](distribution-phase3-evidence/domain.log), [regressões de release](distribution-phase3-evidence/regression.log), [build](distribution-phase3-evidence/build.log)

## Reprodução e arquivos

```sh
npm ci
npm ci --prefix operational-functions
npm run distribution:test
npm run distribution:phase3
npm run distribution:concurrency
npm run distribution:phase3:concurrency
npm run build
# QA visual: Java 21 e Chromium/Playwright no ambiente de teste
npm install --no-save playwright
npx playwright install --with-deps chromium
npm run distribution:phase3:browser
```

`phase3-races.mjs` executa dentro do mesmo Auth/Firestore Emulator usado pelos demais runners. As evidências visuais foram produzidas em ambiente temporário compatível, sem publicar o ZenOS ou contratar plano/serviço permanente.

Principais alterações: serviço transacional `trips.js`; permissões e rotas HTTP existentes; cliente de Distribuição; domínio monetário e fila persistente; `DistributionTrips` com CSS e PT/ES; entrada lazy na Central/App; índices preparados para as consultas; fixtures, testes e runners; workflow de homologação. A relação exata está no diff do commit desta entrega. Foram corrigidos, durante a revisão visual, o cabeçalho estreito do comprovante, a rolagem horizontal por identificadores longos e uma corrida da interface que podia limpar o PIN do próximo acerto antes de concluir a atualização anterior.

## Limites e pendências — sem aceite implícito de produção

Bloqueios de implantação mantidos separados:

1. Comparar a cerca V2 do repositório com as regras efetivamente instaladas e revisar índices. As regras oficiais não foram baixadas nem alteradas nesta fase.
2. Integrar a projeção confiável de habilitação e formas habilitadas pelo Control Center. A configuração sintética de homologação não habilita clientes reais.
3. Hospedar e revisar a segurança do endpoint real. O servidor desta entrega continua restrito ao emulador/loopback.
4. Homologar impressora física. A evidência existente é a renderização A4 no Chromium.

Limites funcionais explícitos:

- Offline foi exercitado com o aplicativo já aberto e viagem iniciada. Reabertura completa sem rede, instalação PWA independente, autenticação offline e sincronização em segundo plano com aplicativo fechado não foram homologadas. A fila persiste, mas exige sessão válida ao reconectar.
- Divergências reconhecidas permanecem auditadas na viagem; não são convertidas automaticamente em despesas, perdas ou receita. O encerramento financeiro de viagens com divergências não foi homologado como ajuste completo do livro/caixa.
- Estorno de devolução em dinheiro físico ainda exige implementação e teste de saldo/turno; nesta fase estão operacionais abatimento de crediário e registro de transferência. Não há pagamento bancário automático.
- Conflitos de acerto com liquidação comercial externa divergente são bloqueados, sem duplicar lançamentos; o tratamento assistido desses conflitos não foi homologado.
- Operação por lote preserva referências/snapshots, sem introduzir uma contabilidade de lotes paralela à infraestrutura existente.
- Evidência visual de acerto completo usa PYG/USD. BRL/EUR e formas eletrônicas têm cobertura de captura transacional indicada nos testes, mas não foram todos repetidos como jornadas visuais completas.
- ZenOS Connect permanece em contratos/eventos versionados `LOCAL_ONLY`: nenhuma comunicação, catálogo ou dado foi enviado a outra empresa.

A entrega permite homologação operacional do escopo executado. Os limites acima não devem ser declarados concluídos nem liberados em produção por consequência desta entrega.

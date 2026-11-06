# ZenOS Distribuição & Logística — Fase 2

Data: 06/11/2026. Continuidade na branch `feat/distribution-logistics-foundation`, a partir de `2bb99e163b4df8b3dc9109d86619a05293e75f74`. Nenhuma nova branch, merge, publicação, migração real ou infraestrutura paga.

## Resultado e limite do aceite

Há uma implementação funcional para homologação LOCAL: interface React → HTTP autenticado → transações reais no Firebase Emulator → envelopes/recibos V2 → romaneios históricos. Não é apenas mock visual. O serviço se recusa a iniciar sem `demo-zenos-local`, Auth Emulator e Firestore Emulator em loopback. Não está pronto para ativação comercial ou produção.

O aceite visual desktop/mobile em navegador real e a impressão em impressora física continuam PENDENTES. O Chromium desta execução não iniciou por bloqueio de socket do ambiente. Os testes interativos de React executaram em jsdom contra a API real e os emuladores; isto valida ações e persistência, mas não layout, responsividade visual ou diálogo nativo de impressão. O teste Playwright está incluído para execução em um ambiente com navegador disponível e não é apresentado como aprovado.

## Como homologar

Requisitos: Node 22, Java 21 e portas locais 8080, 9099, 8787 e 5173 disponíveis.

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund --prefix operational-functions
npm run distribution:test
npm run distribution:homologate
npm run distribution:dev
```

`distribution:dev` inicia emuladores, prepara apenas registros sintéticos, inicia API e Vite. Acesse `http://127.0.0.1:5173/distribution-homologacao.html`.

Credenciais EXCLUSIVAMENTE sintéticas: `distribution-demo@example.test`, senha `SyntheticOnly!482759`, operador `admin`, PIN `482759`. A autenticação ocorre em duas etapas: conta da empresa, depois PIN do operador. O PIN não fica armazenado no cliente; a sessão de operador fica apenas em memória. Reiniciar os emuladores sem importação descarta os dados locais.

A entrada opcional no hub do ZenOS exige homologação, `VITE_ZENOS_DISTRIBUTION=1` e permissão `produtos`. Não há ativação automática para empresas. As regras DEDICADAS desta homologação bloqueiam toda leitura/escrita direta do cliente; por isso a rota independente é o percurso de aceite desta entrega. Elas não substituem as regras oficiais nem permitem homologar todos os módulos do App simultaneamente. O menu incorporado ao App permanece sujeito à homologação com regras V2 certificadas.

## Funcionalidades operacionais

| Área | Implementação | Evidência |
|---|---|---|
| Operador no servidor | Token Firebase da empresa, PIN PBKDF2 v2 com comparação constante, tentativa limitada, sessão de 30 minutos vinculada à geração e credencial; permissões relidas em toda operação, inclusive replay | Testes de PIN errado, bloqueio após 5 erros, operador sem estoque, revogação, expiração, mudança de PIN, suspensão e logout |
| Permissões existentes | Operadores V2 existentes; gerência/admin ou `permissoes.produtos`; vendedores sem estoque não ganham acesso logístico implicitamente | Login de estoque permitido; vendedor sem estoque negado |
| Pedidos | Referências e snapshots de `vendas`, `produtos`, `clientes` e `operadores` existentes; sem cadastros duplicados; alocação integral ou parcial de linhas em cargas | Consolidação de dois vendedores, limite de alocação e arredondamento exato após cancelamento parcial |
| Reserva | `estoqueReservadoDistribuicao` no produto V2; físico permanece intacto; reserva somente no depósito, com disponibilidade verificada em transação | Disputa real pelo último saldo e repetição concorrente |
| Separação/conferência | Início, quantidades informadas manualmente, conferência exata e aprovação antes da documentação | Teste React contra API/Emulator e recusa de divergência |
| Expedição | Exige carga aprovada, reserva e versão atual do romaneio; pré-pedido consome reserva e baixa físico uma vez; venda já finalizada exige comprovante de baixa e não baixa novamente | Duas expedições simultâneas; venda PDV sem segunda baixa |
| Cancelamento | Antes da aprovação/expedição, libera reservas e alocações na mesma transação; histórico da carga preservado | Retry de cancelamento e realocação parcial |
| V2 | Sequência contínua, `fieldRevisions`, envelopes e patches compatíveis, recibo de operação e auditoria de estoque existente na mesma transação | Verificação de sequência, revisão de produtos, ausência de escrita V1 |
| Multimoeda | BRL/PYG/USD/EUR; alocação do total original congelado por pesos registrados; soma em inteiros com BigInt; sem cotação atual ou moeda padrão inferida | PYG com custo BRL independente; testes existentes de dinheiro nativo; somas por moeda e reimpressão histórica |
| Central | Hoje por padrão no fuso da empresa; Este mês/Mês anterior/Personalizado; KPIs, pedidos, cargas, detalhes, separação e histórico; textos PT/ES; CSS responsivo | Testes React de fluxo e troca de idioma; visual manual pendente |
| Romaneio | Snapshots persistidos por versão; razão social/identificação, logo congelado, data/fuso, depósito, veículo, motorista, rota, pedidos/clientes, produtos/unidades, quantidades, valores e totais por moeda, assinaturas e código de verificação | Cadastro alterado depois da emissão não altera versão histórica |
| PDF/A4 | Motor local existente estendido com fontes incorporadas opcionais; recibos antigos mantêm a API anterior; PDF sob demanda, impressão CSS A4 e segunda via explícita | PDF PT/ES renderizado, texto extraído e dimensões A4 verificadas; 50 linhas em 9 páginas |
| Performance | Consultas por cursor com 12+1 registros; projeção compacta de cargas; resumo diário limitado por período; histórico detalhado só ao abrir; cache de 30 s por conta/sessão, até 64 páginas, invalidação após comando/refresh; sem polling | Testes de paginação, cache e isolamento; nenhum `onSnapshot` adicionado |
| Connect | Contrato versionado e validador de envelope com origem/destino/correlação; outbox local transacional e IDs idempotentes | Contrato validado; eventos ficam `LOCAL_ONLY`, sem consumidor/transporte B2B |

## Persistência e integridade

Os únicos cadastros continuam sendo os V2 existentes. Documentos logísticos são operacionais, sob `lojas/{uid}`: `distribution_config`, `distribution_loads`, `distribution_manifests`, `distribution_receipts`, `distribution_daily`, `distribution_audit`, `distribution_outbox`, `distribution_sessions` e `distribution_login_attempts`.

Cada comando lê controle V2, geração pronta, habilitação, sessão/operador e registros envolvidos antes de gravar. A transação confirma carga, produtos/pedidos alterados, recibo logístico, operação V2, cabeçalho, resumo diário e evento local. Expedições também gravam `estoque_auditoria/{chave}/movimentos/{id}` usando o construtor existente. Não cria venda, recebimento ou lançamento financeiro. Respostas de sucesso ocorrem somente após commit. Mesmo conteúdo/chave retorna confirmação anterior; conteúdo ou operador diferente na mesma chave é recusado. Mudança de geração exige nova sessão e reconciliação, não reutiliza comandos históricos.

Os ajustes mínimos em `inventory.js` e `productionSync.js` protegem unidades reservadas contra baixa/transferência e pré-pedidos logísticos contra liquidação concorrente. Produtos sem o novo campo mantêm o comportamento anterior. Enquanto houver reserva, a política conservadora impede consumo dessas unidades mesmo se o produto aceitar estoque negativo. Estorno, devolução física e compensação financeira não são automatizados.

A alocação monetária usa o total original do documento e pesos BRL já congelados; os pesos não representam uma conversão nova. Documentos sem metadados monetários, cliente, vendedor, endereço ou prova de baixa compatíveis são recusados para conferência, sem inferência silenciosa. Quantidades da fase são inteiras na unidade-base; lotes, conversão de embalagens e fracionários não foram liberados.

## Validação executada

- 21 testes de domínio/cliente/contratos/período, incluindo os 13 da fundação.
- 20 testes integrados de backend no Firebase Emulator Standard, incluindo concorrência de reserva/expedição e HTTP com Auth Emulator.
- 2 testes React contra HTTP/Emulator: fluxo completo até expedição e recusa de PIN; não usam respostas simuladas de negócio. Apenas o objeto de autenticação do componente é adaptado ao jsdom; a API recebe e verifica um ID token real do Auth Emulator.
- 1 teste adicional do documento de impressão isolado: snapshot clonado, nenhum controle operacional incluído e limpeza após impressão.
- 9 testes existentes de cartão e fechamento multimoeda e 4 de estoque negativo no conjunto focado.
- 30 testes existentes de moeda nativa/estoque/opção de moeda executados adicionalmente (com sobreposição, não somar como cenários únicos).
- `node scripts/release-check.mjs`: aprovado, incluindo 15 testes de interface existentes. Mensagens de mocks legados foram registradas, sem falhas.
- `npm run build`: aprovado; aviso já conhecido sobre chunk Firebase acima de 500 kB. A Central e o gerador PDF são chunks sob demanda; a entrada HTML independente de homologação não entra no build oficial.
- `git diff --check`: aprovado.

Regras locais: protótipo restritivo de homologação que nega acesso direto do navegador e deixa validação no servidor. Foram compiladas pelo Emulator e testadas contra tentativa de escrita de carga e leitura de sessão diretamente por REST autenticado. Não constituem regras revisadas para distribuição pública; precisam de revisão e integração com as regras V2 oficiais antes de qualquer ampliação de acesso.

## Evidências e arquivos

Os testes reproduzíveis ficam em `scripts/distribution` e `operational-functions/test/distribution`. Evidências do documento são geradas em `tmp/distribution`: snapshot histórico recebido da API, preview HTML da interface, PDFs PT/ES e teste multipágina. Exemplos persistidos nesta branch: [PDF PT](distribution-phase2-evidence/romaneio-pt.pdf), [PDF ES / segunda via](distribution-phase2-evidence/romaneio-es.pdf), [renderização A4](distribution-phase2-evidence/romaneio-pt.png).

Código principal novo: `operational-functions/src/distribution/{security,service,server}.js`; `src/components/DistributionCentral.{jsx,css}`; `src/core/distribution/{client,connect,i18n,period,pdf,pdfFonts,print}.js`; entrada `distribution-homologacao.html` e `src/distribution-homologacao-main.jsx`.

Código existente ajustado: `src/App.jsx` (entrada lazy apenas em homologação com flag), `inventory.js` (disponibilidade reservada), `productionSync.js` (guardas), `zenReceiptPdf.js` (fontes opcionais), `distribution/domain.js` (fuso congelado do romaneio), `vite.config.js` (proxy exclusivamente local), `package.json` (comandos), `.gitignore` (temporários). Configuração de testes/CI: `firebase.distribution.json`, `firestore.distribution-emulator.rules`, `vitest.distribution.config.js`, `.github/workflows/distribution-phase2.yml`. Fontes gratuitas licenciadas em `docs/licenses/DejaVu-fonts.txt`.

## Pendências que impedem aceite integral / produção

1. Revisão visual real em desktop e celular, impressão física e teste Playwright completo. O teste automatizado de navegação existe, mas ficou bloqueado pelo navegador deste ambiente.
2. Ponte comercial para liquidar no PDV um pré-pedido já alocado/expedido, sem segunda baixa. A proteção atual bloqueia essa liquidação; não é um fluxo comercial finalizado. Vendas já concluídas podem seguir a expedição sem segunda baixa. Acerto, cobrança, crédito e fiscal ficam nas próximas fases.
3. Certificar endpoint hospedado, identidade/segurança e regras de estoque V2 contra os escritores reais do PDV. O serviço atual é deliberadamente local e as regras de homologação não substituem as regras oficiais. A concorrência servidor-servidor foi testada; corrida entre PDV Web SDK e logística sob regras oficiais ainda não foi homologada.
4. Integração de entitlement com o Control Center existente: nesta fase a habilitação é um documento sintético local, não uma alegação de integração comercial pronta.
5. Edição de alocações após conferência ainda não liberada; nesta entrega há seleção parcial na criação, cancelamento antes da aprovação e revisão de cabeçalho do romaneio. Recepção confiável de pedidos privados/online, revisão de campos legados incompletos, regras de lotes/unidades, múltiplos depósitos/veículos como estoque móvel, prova de entrega/offline e compensações.
6. Connect: inbox persistente, consumidores, autorizações entre empresas, retentativas/reconciliação e transporte continuam sem ativação.
7. Orçamento real de leituras, p95 de latência e carga sustentada com volume/dispositivos definidos. Não se afirma custo remoto zero ou performance de produção.

Rollback desta entrega: remover/desabilitar a entrada local ou descartar a branch; nenhum dado real foi alterado. Não reverter dados de clientes. Ativação futura dependerá de homologação dos itens acima e autorização expressa para publicação.

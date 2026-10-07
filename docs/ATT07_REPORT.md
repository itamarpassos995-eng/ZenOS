# ATT 07 — Livro Financeiro + Caixa + Fiado + Voucher Impresso

## Baseline oficial
Esta ATT foi construída **exclusivamente** sobre o ZIP aprovado enviado pelo usuário:
`ZenOS-ATT06.2-CORRIGIDA-Multiusuario-Voucher-Impressao(1).zip`.

A ATT 07 anterior foi ignorada e não foi usada como fonte de código.

## 1. ATT
- **ATT:** 07
- **Nome:** Livro Financeiro + Caixa + Fiado + Voucher Impresso
- **Objetivo:** adicionar trilha financeira auditável e visão gerencial de caixa sem regredir os fluxos aprovados da ATT 06.2.
- **Status:** código e regressão lógica/estática concluídos; build Vite e teste real de dois terminais pendentes no ambiente Windows de homologação.

## 2. Problemas tratados
1. Entradas e saídas financeiras não possuíam um livro auditável independente da V1.
2. Fiado era tratado predominantemente como saldo, sem extrato operacional claro para novos eventos.
3. Administrador não tinha painel consolidado dos caixas abertos e dinheiro físico circulando.
4. Dinheiro físico, Pix, cartão, fiado e voucher precisavam ser distinguidos contabilmente.
5. Voucher precisava de comprovante impresso com responsável, código do operador, via e assinaturas.
6. Pagamento de compra de estoque não pode reduzir o resultado duas vezes.

## 3. Arquivos alterados
- `package.json`
  - adiciona scripts `test:att07` e `test:att07:emulator`.
- `src/App.jsx`
  - adiciona estado/listener em tempo real do Livro Financeiro;
  - adiciona registrador financeiro central;
  - calcula saldo físico do turno com fonte única de regras;
  - injeta somente as novas dependências nos módulos afetados.
- `src/components/PDV.jsx`
  - registra novos pagamentos de venda no Livro Financeiro;
  - consolida o fiado da venda em um único débito de extrato;
  - dinheiro é registrado líquido de troco;
  - falha do Livro Financeiro usa modal ZenOS e aborta antes de aplicar estoque/cliente/histórico.
- `src/components/Clientes.jsx`
  - recebimento de fiado gera lançamento financeiro auditável;
  - dinheiro exige turno aberto e aumenta a gaveta;
  - Pix reduz dívida sem alterar gaveta;
  - adiciona extrato do cliente para novos eventos ATT 07.
- `src/components/Vendas.jsx`
  - devolução financeira diferencia dinheiro, Pix/Banco, abatimento de fiado e voucher;
  - dinheiro exige turno aberto e saldo físico suficiente;
  - voucher pode ser impresso com auditoria de via/operador;
  - Central de Vouchers exibe número de impressões.
- `src/components/PDVCompras.jsx`
  - pagamentos imediatos de compras entram no Livro Financeiro como `pagamento_compra`;
  - `afetaResultado:false` para mercadoria de revenda;
  - dinheiro exige caixa aberto/saldo suficiente;
  - falha financeira usa modal ZenOS.
- `src/components/Despesas.jsx`
  - pagamento gera lançamento financeiro;
  - diferencia compra de estoque de despesa operacional;
  - movimento físico de caixa classifica `saida_compra` x `saida_despesa`.
- `src/components/GestaoCaixas.jsx`
  - adiciona, sem remover a auditoria anterior, o painel **CAIXAS ABERTOS AGORA**;
  - exibe **DINHEIRO FÍSICO CIRCULANDO NOS CAIXAS**;
  - mostra saldo esperado por turno e componentes da gaveta;
  - adiciona tabela do Livro Financeiro de novos lançamentos.
- `docs/ZENOS_CHANGELOG.md`
  - registra esta ATT.

## 4. Arquivos criados
- `src/core/financialLedgerCore.js`
- `src/core/financialLedger.js`
- `src/core/cashSession.js`
- `scripts/att07-check.mjs`
- `scripts/att07-emulator-check.mjs`
- `docs/ATT07_REPORT.md`

## 5. Arquivos removidos
**Nenhum.**

## 6. Banco de dados
- **Banco de produção alterado:** NÃO
- **Dados existentes modificados:** NÃO
- **Dados existentes excluídos:** NÃO
- **IDs existentes alterados:** NÃO
- **Migração executada:** NÃO
- **V2 ativada:** NÃO
- **Estrutura nova preparada no código:** SIM — subcoleção aditiva `lojas/{lojaId}/financeiro_livro/{lancamentoId}` para novos eventos.

Nenhuma venda/compra/cliente antigo é reconstruído ou regravado por inferência.

## 7. Impacto nos dados do cliente
- **Produtos existentes:** NÃO ALTERADOS
- **Clientes existentes:** NÃO MIGRADOS
- **Vendas existentes:** NÃO REESCRITAS
- **Estoques existentes:** NÃO MIGRADOS
- **Históricos existentes:** NÃO RECONSTRUÍDOS
- **Configurações existentes:** PRESERVADAS
- **Fiado antigo:** saldo V1 continua válido; extrato auditável nasce para novos eventos ATT 07.

## 8. Compatibilidade
- **Compatível com baseline ATT 06.2 corrigida:** SIM, pelos testes estáticos/lógicos.
- **Fallback V1 preservado:** SIM
- **Rollback de código:** SIM — a estrutura nova é aditiva e não apaga a V1.
- **Migração automática:** NÃO

## 9. Livro Financeiro
Novos lançamentos usam documentos independentes em:

`lojas/{lojaId}/financeiro_livro/{lancamentoId}`

Campos principais:
- `id`
- `lojaId`
- `tipo`
- `origem`
- `referenciaId`
- `valor`
- `moeda`
- `formaPagamento`
- `operadorId`
- `operadorNome`
- `createdAt`
- `afetaCaixaFisico`
- `afetaResultado`
- `direcao`
- `sessaoId`
- `clienteId`
- `saldoClienteAntes`
- `saldoClienteDepois`
- `observacao`

Os IDs são determinísticos quando a origem permite, reduzindo duplicação em repetição de chamada.

## 10. Caixa físico
Regra aplicada:
- Dinheiro: pode afetar gaveta.
- Pix: não afeta gaveta.
- Cartão: não afeta gaveta.
- Voucher: não afeta gaveta.
- Fiado na venda: não afeta gaveta.
- Recebimento de fiado em dinheiro: aumenta gaveta.
- Devolução em dinheiro: reduz gaveta.
- Compra paga em dinheiro: reduz gaveta.
- Despesa paga em dinheiro: reduz gaveta.

O saldo esperado é calculado com fundo + entradas físicas - saídas físicas.

## 11. Painel do administrador — caixas abertos
Foi adicionado de forma harmônica dentro da tela já existente de Gestão/Auditoria de Caixas, sem remover o histórico aprovado.

Para cada turno aberto mostra:
- operador;
- código do operador;
- abertura;
- fundo inicial;
- vendas em dinheiro;
- recebimentos em dinheiro;
- suprimentos;
- sangrias;
- devoluções em dinheiro;
- despesas em dinheiro;
- compras em dinheiro;
- saldo físico esperado;
- status.

No topo mostra o total **DINHEIRO FÍSICO CIRCULANDO NOS CAIXAS**.

## 12. Fiado como extrato
Novos eventos de conta corrente passam a carregar saldo antes/depois.

Exemplo:
- Venda fiada: débito do cliente.
- Recebimento: crédito do cliente.

O extrato deixa explícito que a trilha auditável inicia na ATT 07 e não inventa histórico anterior.

## 13. Devoluções financeiras
O motor aprovado de estoque/devolução foi preservado.

Tratamento financeiro adicionado:
- dinheiro da gaveta;
- Pix/Banco;
- abatimento do fiado;
- voucher.

Dinheiro exige turno e saldo físico suficiente. Abatimento de fiado não permite reduzir dívida abaixo de zero.

## 14. Voucher impresso
A Central de Vouchers ganhou impressão utilizando configuração já aprovada de nome/logo/papel.

Conteúdo:
- código;
- valor original;
- saldo;
- cliente;
- venda de origem;
- emissão;
- emitido por + código;
- impresso por + código;
- data/hora da solicitação;
- número da via;
- assinatura do cliente;
- assinatura do vendedor/administrador.

Cada solicitação de impressão é adicionada a `voucher.impressoes[]`. O sistema registra a solicitação, não afirma que o papel saiu fisicamente da impressora.

## 15. Compras e despesas
Mercadoria para revenda continua com `afetaResultado:false`; seu pagamento pode afetar fluxo/caixa, evitando dupla contagem de custo no lucro.

Despesa operacional mantém `afetaResultado:true` quando configurada assim.

## 16. Não regressão — baseline protegido
Os testes verificaram hash byte a byte e mantiveram inalterados:
- `src/components/Produtos.jsx`
- `src/components/Comissoes.jsx`
- `src/components/Configuracoes.jsx`
- `src/components/Mesas.jsx`
- `src/components/DashboardMobile.jsx`
- `src/components/EstoqueInteligente.jsx`
- `src/components/ZenModal.jsx`
- `src/core/inventory.js`
- `src/core/profitability.js`
- `src/core/productIdentity.js`
- `src/core/stockAudit.js`
- `src/core/storeProfile.js`

Logo, Catálogo, semáforo, comissão, estoque e modal-base não foram refatorados nesta ATT.

## 17. Alert / Confirm / Prompt
Nenhum arquivo tocado aumentou o número de diálogos nativos em relação ao baseline.

Contagem baseline → ATT07:
- `App.jsx`: 9 → 9
- `Clientes.jsx`: 7 → 4
- `PDV.jsx`: 18 → 18
- `PDVCompras.jsx`: 7 → 7
- `Vendas.jsx`: 1 → 1
- `Despesas.jsx`: 3 → 3

As ocorrências restantes são legadas da baseline e não foram ampliadas. Fluxos novos de recebimento/validação usam `ZenModal` quando necessário.

## 18. Testes executados
- ATT 01: 21/21 OK
- ATT 01.1: 16/16 OK
- ATT 02: 10 grupos OK
- ATT 03: 21/21 OK
- ATT 04: 24/24 OK
- ATT 06: 18/18 OK
- ATT 06.1: 18/18 OK
- ATT 06.2: 24/24 OK
- ATT 07: verificações de Livro Financeiro, caixa, fiado, voucher e não regressão OK

Casos adicionais verificados:
- dinheiro líquido de troco;
- recebimento de fiado em dinheiro;
- separação Pix x gaveta;
- devolução/despesa/compra em dinheiro;
- consolidação de múltiplos pagamentos fiados de uma mesma venda em um único débito de extrato;
- falha de registro financeiro bloqueando venda/compra antes da aplicação operacional;
- compra de estoque classificada separadamente de despesa na gaveta;
- histórico de devolução separa Pix de dinheiro.

## 19. Testes NÃO executados / não certificados neste ambiente
### Build Vite
**NÃO CERTIFICADO no container do assistente.**
`npm ci` não concluiu dentro do limite do ambiente e o executável do Vite não ficou disponível.

Deve ser validado no Windows de homologação com:
`npm.cmd run build`

### Teste real de dois terminais no Emulator
Foi criado `scripts/att07-emulator-check.mjs`, que abre duas instâncias Firebase e verifica que dois lançamentos independentes chegam aos dois listeners sem sobrescrita.

**NÃO EXECUTADO aqui** porque as dependências Firebase não terminaram de instalar no container.

Validar no Windows com:
`npm.cmd run test:att07:emulator`

## 20. Riscos restantes
1. Antes de produção, as regras Firestore reais precisam autorizar com segurança `lojas/{lojaId}/financeiro_livro/{lancamentoId}`.
2. V1 ainda mantém vários domínios como arrays no documento operacional; o Livro Financeiro novo é independente, mas a eliminação completa da concorrência de toda a V1 continua sendo trabalho da V2.
3. O extrato auditável novo não reconstrói movimentações anteriores à ATT 07.
4. Operações que abrangem múltiplas estruturas V1 + nova subcoleção ainda não são uma transação Firestore única entre todos os domínios; a ATT 07 bloqueia novos fluxos críticos quando o registro financeiro falha antes da aplicação local, mas a arquitetura final deve convergir na V2.

## 21. Rollback
Como não houve migração ou exclusão, retornar ao ZIP baseline ATT 06.2 corrigida restaura o comportamento anterior. Documentos ATT07 eventualmente criados em homologação/produção futura são aditivos e não substituem a V1; qualquer estratégia de limpeza deve ser deliberada, nunca automática.

## 22. Próximo passo recomendado
Antes de ATT 08:
1. `npm.cmd run build`
2. `npm.cmd run test:att07:emulator`
3. validar visualmente painel de caixas, extrato, devolução financeira e voucher impresso em homologação.
4. revisar regras Firestore reais antes de qualquer deploy.

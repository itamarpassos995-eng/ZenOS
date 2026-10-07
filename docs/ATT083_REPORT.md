# ATT 08.3 — Correção do Fechamento Cego de Caixa

## Objetivo
Corrigir a regressão encontrada no fechamento cego de caixa sem alterar os fluxos aprovados das ATT anteriores.

## Problema encontrado
O botão **Auditar e Imprimir Fecho** chamava `processarFechamentoCego`, porém a função referenciava variáveis que não existiam no runtime (`suprimentosSessaoBRL`, `sangriasSessaoBRL` e `saidasComprasDinheiroSessaoBRL`). Ao clicar, ocorria erro JavaScript antes do encerramento/impressão, dando a impressão de que o botão não possuía ação.

Além disso, a tela não explicava suficientemente o conceito de caixa cego: o operador precisa contar o dinheiro físico sem conhecer o saldo esperado, informar o valor contado e somente após concluir a auditoria o ZenOS deve revelar a diferença.

## Correção
- O fechamento passa a usar `resumoSessaoAtiva`, calculado pelo motor canônico `calcularResumoSessao`.
- Aliases necessários para compatibilidade com testes antigos são definidos a partir do resumo canônico, eliminando referências indefinidas.
- Antes do fechamento, o sistema exige uma contagem explícita. Campos totalmente vazios não encerram o turno; para gaveta zerada o operador deve informar `0`.
- O total físico informado é exibido convertido para BRL, mas o saldo esperado permanece oculto até a conclusão.
- Após concluir, o turno registra `saldoSistema`, `saldoInformado`, `diferenca`, `fechamentoCego` e operador da auditoria.
- O comprovante discrimina fundo, vendas em dinheiro, recebimentos, suprimentos, sangrias, devoluções, despesas e compras em dinheiro.
- Após a auditoria o ZenOS mostra saldo esperado, total contado e diferença por modal ZenOS.
- O botão foi renomeado para **Concluir Contagem, Auditar e Imprimir**.

## Regra do caixa cego preservada
1. O operador conta fisicamente a gaveta.
2. O ZenOS NÃO mostra o saldo esperado antes da contagem.
3. O operador informa BRL/USD/EUR/PYG efetivamente encontrados.
4. O ZenOS converte a contagem para BRL usando as cotações configuradas.
5. Só após concluir a auditoria o sistema revela o saldo esperado e a diferença.
6. O turno é fechado e o comprovante é aberto para impressão.

## Arquivos alterados
- `src/App.jsx`
- `package.json` (apenas inclusão de `test:att083`)

## Arquivos criados
- `scripts/att083-check.mjs`
- `docs/ATT083_REPORT.md`

## Arquivos removidos
Nenhum.

## Banco e dados
- Banco de produção acessado: NÃO
- Dados existentes modificados: NÃO
- Dados existentes excluídos: NÃO
- IDs existentes alterados: NÃO
- Migração executada: NÃO
- V2 ativada: NÃO

## Regressão executada
- ATT 01: aprovada
- ATT 01.1: aprovada
- ATT 02: aprovada
- ATT 03: aprovada
- ATT 04: aprovada
- ATT 06: aprovada
- ATT 06.1: aprovada
- ATT 06.2: aprovada
- ATT 07: aprovada
- ATT 07.1: aprovada
- ATT 08: aprovada
- ATT 08.1: aprovada
- ATT 08.2: aprovada
- ATT 08.3: 10/10

## Build
O `npm ci` não concluiu dentro do limite do ambiente de execução. Portanto o build Vite permanece como gate obrigatório no Windows do usuário antes de homologar esta corretiva.

## Teste manual recomendado
1. Abrir turno com fundo de R$ 100.
2. Fazer uma venda em dinheiro de R$ 60.
3. Abrir Fechamento Cego.
4. Confirmar que o sistema NÃO mostra saldo esperado.
5. Informar a contagem física real, por exemplo BRL 160.
6. Clicar em **Concluir Contagem, Auditar e Imprimir**.
7. Confirmar resultado: esperado R$ 160, contado R$ 160, diferença R$ 0.
8. Repetir com valor contado diferente para validar falta/sobra.
9. Confirmar que o turno muda para fechado e aparece no Histórico de Turnos.

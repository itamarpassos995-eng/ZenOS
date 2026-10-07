# ZenOS — Auditoria Mesas / Comandas V1 (ATT 09)

## Status final
# EXPERIMENTAL — NÃO LIBERAR COMERCIALMENTE AINDA

A ATT 09 corrige o maior risco estrutural do módulo — Mesas deixa de depender exclusivamente de `localStorage` e passa a possuir estado sincronizado no Firestore com transações — porém o módulo ainda não implementa todos os contratos financeiros/estoque necessários para ser declarado estável.

## Baseline ATT 08.3
Antes da ATT 09:
- Mesas era persistida em cache local por UID;
- outro terminal podia não enxergar a mesa;
- fechamento criava venda, mas não utilizava integralmente o mesmo motor de estoque/financeiro aprovado do PDV;
- pagamento era único/simplificado;
- não havia tratamento completo de fiado/misto/voucher;
- concorrência entre terminais não possuía transação Firestore.

## Correções ATT 09
### Persistência e realtime
Novo documento V1:
`lojas/{uid}/dados/mesas`

- listener `onSnapshot` mantém terminais atualizados;
- criação inicial usa mesas/comandas padrão;
- cache legado `zenos_{uid}_mesas_ativas` pode ser importado **somente se o documento cloud ainda não existir**;
- não há novas gravações locais de Mesas;
- chave legada não é apagada automaticamente.

### Concorrência
Alterações de mesa passam por `runTransaction()`:
- lê versão atual;
- altera somente a mesa escolhida;
- incrementa `version`;
- registra operador e horário cliente;
- grava `updatedAtServer`.

Isso impede o caso simples em que Terminal A e Terminal B regravavam cegamente o array local e uma alteração apagava a outra.

## Matriz de auditoria

| Fluxo | Situação ATT 09 | Observação |
| --- | --- | --- |
| Criar mapa inicial | OK | documento cloud V1 |
| Abrir Mesa/Comanda | OK | realtime |
| Adicionar item | OK estrutural | transação, mas ainda não reserva estoque |
| Alterar quantidade | OK estrutural | transação |
| Remover item | OK estrutural | quantidade até zero |
| Outro terminal enxergar alteração | teste Emulator preparado | exige execução com dependências Firebase |
| Concorrência A/B | transação implementada | teste Emulator preparado |
| Trocar operador da mesa | PARCIAL | `updatedBy` registra quem alterou; não existe fluxo de transferência formal |
| Associar cliente | NÃO IMPLEMENTADO | baseline não possuía fluxo completo |
| Comprometer estoque ao adicionar | NÃO | risco comercial |
| Baixar estoque ao fechar | NÃO usa motor completo aprovado | risco comercial |
| Cancelamento/reposição de estoque | NÃO completo | risco comercial |
| Dinheiro integrado à gaveta | NÃO completo | fechamento atual cria venda simplificada |
| Pix/cartão no Livro Financeiro | NÃO completo | não usa motor financeiro completo do PDV |
| Fiado | NÃO IMPLEMENTADO no fechamento de Mesa |
| Pagamento misto | NÃO IMPLEMENTADO |
| Voucher com saldo/consumo | catálogo visual existe, consumo seguro NÃO completo |
| Fechamento parcial | NÃO IMPLEMENTADO |
| Fechamento total | funcional baseline, mas NÃO comercialmente aprovado |

## Por que não foi “consertado à força”
Integrar estoque, fiado, voucher, pagamento misto e Livro Financeiro exigiria transformar o fechamento de Mesas em uma segunda implementação do PDV ou extrair um motor transacional comum. Isso ultrapassa uma correção cirúrgica de blindagem e cria risco de regressão nos módulos aprovados.

A ordem de serviço determina preservar em caso de dúvida. Portanto a ATT 09:
1. elimina a dependência exclusivamente local;
2. adiciona realtime e concorrência transacional;
3. marca o módulo de forma visível como EXPERIMENTAL;
4. documenta os contratos ainda não atendidos;
5. **não finge que o módulo está seguro para venda comercial**.

## Condição para aprovação futura
Mesas só pode deixar o status EXPERIMENTAL quando passar, em homologação, pelo mesmo motor canônico do PDV para:
- reserva/baixa/reposição de estoque;
- dinheiro/Pix/cartão;
- fiado;
- misto;
- voucher;
- Livro Financeiro;
- caixa físico;
- cancelamento;
- fechamento parcial e total;
- dois terminais concorrentes.

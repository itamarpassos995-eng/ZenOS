# ZenOS — Relatório ATT 04

## 1. ATT

- ATT: 04
- Nome: Operação, Compras, Comissões e Semáforo por Margem
- Objetivo: corrigir inconsistências detectadas na homologação sem alterar dados históricos nem iniciar V2.
- Status: código e testes lógicos/estáticos concluídos; build Windows pendente de validação.

## 2. PROBLEMA CORRIGIDO

### Produto rápido do PDV
O botão `+ Produto Balcão` criava todo novo produto com `usoUnicoEncomendado:true` e SKU `ENCOMENDA-*`. Ao fechar a venda o produto era removido do catálogo, mesmo quando deveria ser um produto normal de estoque.

### Cancelamento de encomendas antigas
Versões anteriores também inferiam encomenda pelo SKU. Em alguns registros a informação explícita podia não acompanhar o item histórico; como o produto de uso único já havia sido removido do catálogo, a devolução podia tentar repor um produto inexistente e abortar.

### Compras à vista e lucro
Compras imediatas não apareciam em Contas a Pagar. Ao mesmo tempo, compras a prazo de mercadoria podiam futuramente ser pagas como `despesa` e reduzir o lucro novamente, embora o custo da mercadoria já entre no lucro da venda como CMV.

### Comissões e semáforo
A tela tinha filtro mensal pouco prático e não oferecia intervalo livre. Além disso, Dashboard CEO possuía uma regra fixa de margem saudável (35%) diferente das regras configuradas no PDV/Comissões.

## 3. ARQUIVOS ALTERADOS

- `src/App.jsx` — exclui estoque/ativo das despesas operacionais do lucro, registra saída de compra em dinheiro na gaveta e passa dados necessários aos módulos.
- `src/components/PDV.jsx` — produto rápido normal por padrão; encomenda somente por marcação; semáforo centralizado.
- `src/components/Vendas.jsx` — compatibilidade segura para estorno de encomendas legadas.
- `src/components/PDVCompras.jsx` — entrada coerente em galpão, conta paga/pendente da compra e saída de gaveta quando dinheiro.
- `src/components/Comissoes.jsx` — navegação mensal, período personalizado, margem média e semáforo centralizado.
- `src/components/Configuracoes.jsx` — impede margem mínima maior que a ideal.
- `src/components/DashboardMobile.jsx` — mesma regra de margem do restante do sistema e exclusão de estoque/ativo das despesas operacionais.
- `src/components/Despesas.jsx` — identifica compras de estoque que não afetam resultado e melhora exibição de datas.
- `src/components/Produtos.jsx` — identificação de encomenda compatível com registros novos/legados.
- `src/components/Mesas.jsx` — usa a mesma identificação de encomenda.
- `src/core/commissions.js` — aceita mês ou intervalo personalizado.
- `src/core/dates.js` — filtro por intervalo e navegação de mês.
- `package.json` — adiciona `test:att04`.
- `docs/ZENOS_CHANGELOG.md` — registra a ATT.

## 4. ARQUIVOS CRIADOS

- `src/core/orderItems.js`
- `src/core/profitability.js`
- `scripts/att04-check.mjs`
- `docs/ATT04_REPORT.md`

## 5. ARQUIVOS REMOVIDOS

Nenhum.

## 6. BANCO DE DADOS

- Banco de produção alterado: NÃO
- Dados existentes modificados: NÃO
- Dados existentes excluídos: NÃO
- IDs existentes alterados: NÃO
- Migração executada: NÃO
- Estrutura nova V2 adicionada: NÃO

A ATT adiciona campos somente em registros NOVOS quando o usuário efetivamente operar essa versão, preservando leitura dos registros antigos.

## 7. IMPACTO NOS DADOS DO CLIENTE

- Produtos existentes: NÃO MIGRADOS / NÃO REESCRITOS EM LOTE
- Clientes existentes: NÃO ALTERADOS
- Vendas existentes: NÃO REESCRITAS
- Estoques existentes: NÃO MIGRADOS; novas operações usam coerência vitrine + galpão
- Financeiro existente: NÃO MIGRADO
- Históricos existentes: PRESERVADOS
- Configurações existentes: PRESERVADAS

## 8. COMPATIBILIDADE

- Compatível com V1: SIM
- Fallback/compatibilidade legada: SIM
- Rollback possível: SIM
- V2 ativada: NÃO

## 9. COMO FUNCIONAVA ANTES

`+ Produto Balcão` abria como encomenda. Venda finalizada removia esse cadastro. Compra à vista não gerava registro em Contas a Pagar. Conta de mercadoria paga podia ser confundida com despesa operacional. Comissão tinha apenas seleção mensal e o Dashboard CEO usava margem fixa diferente.

## 10. COMO FUNCIONA AGORA

Produto rápido nasce normal e permanece no catálogo/estoque. O checkbox transforma explicitamente o item em encomenda de uso único. Compras entram em Contas a Pagar; pagamentos imediatos entram já como pagos e são marcados como estoque/ativo, sem reduzir lucro novamente. Dinheiro reduz a gaveta quando houver turno aberto. Comissões aceitam mês e período personalizado. Todas as áreas usam a mesma faixa de margem configurada.

## 11. EXEMPLO PRÁTICO

### Produto rápido
Antes: criar `borrachudo` no PDV => SKU ENCOMENDA => vender => produto desaparece.

Agora: criar `borrachudo`, checkbox desmarcado => SKU BALCAO => produto permanece no catálogo; venda baixa o estoque normalmente.

### Compra
Compra de R$ 1.000 de mercadoria à vista:
- Contas a Pagar: registro `Paga` de R$ 1.000.
- Natureza: `estoque_ativo`.
- Lucro líquido: NÃO subtrai R$ 1.000 novamente.
- Quando a mercadoria é vendida, o custo correspondente entra no CMV/lucro da venda.
- Se o pagamento foi em dinheiro e há turno aberto, a gaveta reduz R$ 1.000.

## 12. TESTES EXECUTADOS

- ATT 01: 21/21
- ATT 01.1: 16/16
- ATT 02: 10 grupos
- ATT 03: 21/21
- ATT 04: 24/24

ATT 04 validou, entre outros:
- produto rápido normal por padrão;
- encomenda explícita;
- encomenda legada;
- cancelamento/estorno sem tentativa de repor encomenda removida;
- compra adicionando estoque ao galpão;
- compra imediata como conta paga;
- compra de estoque sem dupla contagem no lucro;
- saída de gaveta em compra em dinheiro;
- mês anterior/seguinte de comissão;
- intervalo personalizado;
- faixas verde/amarela/vermelha de margem;
- margem média real em comissão.

## 13. TESTES NÃO EXECUTADOS

- Build Vite no ambiente do assistente: NÃO CONCLUÍDO porque `npm ci` excedeu o limite do container.
- Teste visual Windows: PENDENTE.
- Firebase de produção: NÃO ACESSADO.
- Deploy produção: NÃO EXECUTADO.

## 14. RISCOS RESTANTES

- Devolução em dinheiro/Pix ainda precisa virar movimento financeiro/caixa completo.
- Fiado ainda precisa extrato de conta corrente e rastreabilidade de recebimentos.
- Caixa precisa consolidar todas as entradas/saídas financeiras além da gaveta física.
- Compras pagas por meios não físicos são registradas, mas um Livro Financeiro central ainda é etapa futura.
- Concorrência multi-terminal V1 continua pendente.
- Mesas/comandas ainda precisam integração completa.
- Reset granular destrutivo continua pendente de blindagem adicional.

## 15. PRÓXIMA ATT RECOMENDADA

ATT 05 — Livro Financeiro, Caixa e Fiado: unificar recebimentos, devoluções, compras, despesas e meios de pagamento sem dupla contagem, mantendo o caixa físico separado do resultado contábil.

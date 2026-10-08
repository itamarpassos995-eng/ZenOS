# ZenOS — Relatório ATT 02

## 1. ATT

- ATT: 02
- Nome: Reconciliação de Estoque + Devoluções
- Objetivo: eliminar as duas verdades de estoque entre PDV/Catálogo e tornar devoluções consistentes com estoque e valor líquido da venda.
- Status: CÓDIGO CONCLUÍDO; testes lógicos/estáticos aprovados; build Vite deve ser validado no ambiente Windows do projeto.

## 2. PROBLEMA CORRIGIDO

Foram confirmados quatro problemas relacionados:

1. O PDV reduzia apenas `produto.estoque`, enquanto o Catálogo exibia `estoqueVitrine` e `estoqueGalpao`. Uma venda podia fazer o PDV mostrar 20 e o Catálogo continuar mostrando Depósito 50.
2. A devolução procurava o produto usando o ID temporário da linha da venda (`item.id`) em vez de `produtoOriginalId`, impedindo a reposição do estoque em várias vendas.
3. A devolução incrementava apenas `estoque`, sem manter `estoque = estoqueVitrine + estoqueGalpao`.
4. O valor do estorno usava preço cheio do item e podia ignorar desconto global da venda, possibilitando devolver mais do que foi efetivamente pago.

A ATT também faz a venda parcial continuar financeiramente existente, preservando o total bruto histórico e adicionando campos líquidos.

## 3. ARQUIVOS ALTERADOS

### `src/components/PDV.jsx`
- Substituída a baixa isolada de `estoque` pelo motor central `aplicarVendaAoEstoque()`.
- Venda passa a baixar Vitrine primeiro e Galpão depois.
- Cada item vendido recebe `movimentoEstoqueVenda` com a origem real da baixa.
- Venda acima do estoque passa a ser bloqueada em vez de ser silenciosamente limitada a zero.
- `produtoOriginalId` continua preservado.

### `src/components/Vendas.jsx`
- Devolução agora localiza produto por `produtoOriginalId`.
- Reposição usa Vitrine/Galpão e mantém o total consistente.
- Vendas novas repõem na mesma origem da baixa quando possível.
- Vendas legadas sem origem registrada usam fallback compatível.
- Removidas gravações genéricas concorrentes de `zenos_produtos`, `zenos_clientes` e `zenos_historico_vendas`; a persistência continua centralizada no `App.jsx`.
- Estorno respeita desconto global da venda.
- Preserva `totalBRL` e `lucroBRL` originais.
- Adiciona `valorDevolvidoBRL`, `custoDevolvidoBRL`, `totalLiquidoBRL`, `lucroLiquidoBRL` e histórico `devolucoes`.
- O valor exibido no histórico após devolução passa a ser líquido; o recibo original continua mostrando o valor original.

### `src/App.jsx`
- Dashboard principal passa a considerar vendas `concluida` e `parcial`.
- Faturamento/lucro passam a usar valores líquidos após devolução.
- Curva ABC usa `produtoOriginalId`/SKU para não fragmentar o mesmo produto pelo ID temporário da linha.

### `src/components/DashboardMobile.jsx`
- Faturamento e lucro passam a usar valores líquidos.
- Quantidade do produto destaque desconta itens devolvidos.

### `package.json`
- Adicionado `npm run test:att02`.

### `docs/ZENOS_CHANGELOG.md`
- Registro da ATT 02 e validações locais anteriores.

## 4. ARQUIVOS CRIADOS

- `src/core/inventory.js`
- `src/core/salesFinancials.js`
- `scripts/att02-check.mjs`
- `docs/ATT02_REPORT.md`

## 5. ARQUIVOS REMOVIDOS

Nenhum.

## 6. BANCO DE DADOS

- Banco de produção alterado: NÃO
- Dados existentes modificados pelo processo de desenvolvimento: NÃO
- Dados existentes excluídos: NÃO
- IDs existentes alterados: NÃO
- Migração executada: NÃO
- Estrutura V2 adicionada: NÃO

A ATT adiciona apenas campos novos às vendas quando novas devoluções forem executadas pelo sistema atualizado. A venda original é preservada.

## 7. IMPACTO NOS DADOS DO CLIENTE

- Produtos existentes: NÃO MIGRADOS / NÃO RECRIADOS
- Clientes existentes: NÃO MIGRADOS / NÃO RECRIADOS
- Vendas existentes: NÃO REESCRITAS EM LOTE
- Estoques existentes: NÃO ALTERADOS AUTOMATICAMENTE
- Financeiro existente: NÃO ALTERADO AUTOMATICAMENTE
- Históricos existentes: NÃO EXCLUÍDOS
- Configurações existentes: NÃO ALTERADAS

Produtos que já possuam divergência antiga entre `estoque` e Vitrine/Galpão são reconciliados somente quando participarem de uma operação de estoque no código novo. O total `estoque`, que era o campo historicamente reduzido pelo PDV, é preservado como total canônico para compatibilidade.

## 8. COMPATIBILIDADE

- Compatível com V1: SIM
- Fallback V1 preservado: SIM
- Rollback possível: SIM
- V2 ativada: NÃO
- Migração automática: NÃO

Vendas antigas sem `movimentoEstoqueVenda` continuam devolvíveis por fallback. Vendas novas passam a registrar a origem da baixa.

## 9. COMO FUNCIONAVA ANTES

Exemplo observado:

- Cadastro: Vitrine 0 / Depósito 50 / Total 50
- Venda: 30
- PDV: `estoque` virava 20
- Catálogo: continuava Vitrine 0 / Depósito 50
- Devolução: tentava encontrar produto pelo ID temporário da linha e frequentemente não repunha nada.

## 10. COMO FUNCIONA AGORA

- Cadastro: Vitrine 0 / Depósito 50 / Total 50
- Venda: 30
- Resultado: Vitrine 0 / Depósito 20 / Total 20
- A venda registra que as 30 unidades saíram do Galpão.
- Devolução: 10
- Resultado: Vitrine 0 / Depósito 30 / Total 30

Se houver 10 na Vitrine e 40 no Galpão e forem vendidas 15:

- baixa 10 da Vitrine;
- baixa 5 do Galpão;
- ficam Vitrine 0 / Galpão 35 / Total 35.

## 11. EXEMPLO PRÁTICO

### ANTES

```
Vitrine = 0
Galpão = 50
Total = 50
Venda = 30

PDV = 20
Catálogo = Depósito 50
```

### AGORA

```
Vitrine = 0
Galpão = 50
Total = 50
Venda = 30

Vitrine = 0
Galpão = 20
Total = 20

Devolução = 10

Vitrine = 0
Galpão = 30
Total = 30
```

## 12. TESTES EXECUTADOS

- [OK] ATT 01 — 21/21 verificações
- [OK] ATT 01.1 — 16/16 verificações
- [OK] Cenário real Depósito 50 - venda 30 = 20
- [OK] Devolução 10 repõe Depósito/Total para 30
- [OK] Venda consome Vitrine antes do Galpão
- [OK] Devolução parcial cumulativa repõe a origem correta
- [OK] Divergência legada total/localizações é reconciliada preservando o total canônico
- [OK] Venda acima do estoque é bloqueada
- [OK] Devolução sem desconto devolve o valor correto
- [OK] Devolução com desconto global não devolve mais que o pago
- [OK] Venda parcial antiga recebe leitura líquida sem reescrever o valor original
- [OK] Devolução usa `produtoOriginalId`
- [OK] Não há persistência genérica concorrente de produtos/clientes/histórico no componente Vendas

## 13. TESTES NÃO EXECUTADOS

- Build Vite completo desta ATT no ambiente do assistente: NÃO CONCLUÍDO. Motivo: o `npm ci` do container expirou antes de instalar o Vite.
- Teste real em produção: NÃO EXECUTADO.
- Firebase real: NÃO ACESSADO.
- Migração real: NÃO EXECUTADA.

O build deve ser validado no Windows com:

```
npm.cmd ci
npm.cmd run test:att01
npm.cmd run test:att011
npm.cmd run test:att02
npm.cmd run build
npm.cmd run dev:test
```

## 14. RISCOS RESTANTES

A ATT 02 NÃO resolve ainda:

- devolução em dinheiro/Pix ainda não gera automaticamente movimento de saída no caixa;
- voucher é registrado no evento da devolução, mas ainda não existe carteira/ledger completo de vouchers;
- abatimento de fiado ainda usa saldo agregado; extrato completo do cliente será tratado na ATT específica;
- filtro mensal de comissões por data continua com o bug identificado;
- `Vendido Hoje` ainda precisa da correção de período;
- concorrência entre terminais e arquitetura Firestore V2 ainda não foram implementadas;
- quantidade fracionada ainda precisa revisão completa em todas as telas;
- Mesas/Comandas continuam fora deste escopo.

## 15. PRÓXIMA ATT RECOMENDADA

ATT 03 — Datas, "Vendido Hoje" e Comissões.

Antes disso, validar a ATT 02 no ambiente de homologação com o cenário controlado de estoque e devolução.

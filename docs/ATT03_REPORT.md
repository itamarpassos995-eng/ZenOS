# RELATÓRIO DA ATT 03

## 1. ATT

- **ATT:** 03
- **Nome:** Datas, Vendido Hoje e Comissões
- **Objetivo:** corrigir filtros temporais e bases de comissão sem reescrever o histórico V1.
- **Status:** código concluído; testes lógicos/estáticos aprovados; build pendente de validação no Windows de homologação.

## 2. PROBLEMA CORRIGIDO

1. O cartão **Vendido Hoje** somava todas as vendas concluídas/parciais do histórico, apesar do rótulo indicar apenas o dia atual.
2. O módulo **Comissões** usava `v.dataHora.startsWith('YYYY-MM')`, mas as vendas V1 são gravadas principalmente como `DD/MM/YYYY, HH:mm:ss`, fazendo o filtro mensal falhar.
3. Vendas novas não possuíam um campo estruturado de data próprio para cálculo; apenas `dataHora` formatado para exibição.
4. A comissão usava `totalBRL` e `lucroBRL` brutos, portanto uma devolução parcial poderia continuar pagando comissão sobre valor/lucro que já não existiam.

## 3. ARQUIVOS ALTERADOS

### `src/App.jsx`
- adiciona filtro de vendas do dia local;
- mantém faturamento histórico total separado;
- cartão **Vendido Hoje** usa somente `faturamentoHojeBRL`.

### `src/components/Comissoes.jsx`
- substitui `startsWith()` por leitura temporal compatível;
- inclui vendas `concluida` e `parcial` válidas do mês;
- exclui canceladas, pendentes e vendas sem saldo líquido;
- calcula faturamento, lucro, margem e comissão sobre valores líquidos após devoluções.

### `src/components/PDV.jsx`
- novas vendas/orçamentos/pré-pedidos recebem `createdAt` ISO;
- `dataHora` legado continua sendo gravado para interface/compatibilidade.

### `src/components/Mesas.jsx`
- novas vendas do módulo recebem `createdAt` ISO;
- `dataHora` legado é preservado.

### `package.json`
- adiciona `npm run test:att03`.

### `docs/ZENOS_CHANGELOG.md`
- registra a ATT 03.

## 4. ARQUIVOS CRIADOS

- `src/core/dates.js`
- `src/core/commissions.js`
- `scripts/att03-check.mjs`
- `docs/ATT03_REPORT.md`

## 5. ARQUIVOS REMOVIDOS

Nenhum.

## 6. BANCO DE DADOS

- Banco de produção alterado: **NÃO**
- Dados existentes modificados: **NÃO**
- Dados existentes excluídos: **NÃO**
- IDs existentes alterados: **NÃO**
- Migração executada: **NÃO**
- Estrutura nova adicionada ao banco: **NÃO**

`createdAt` é adicionado apenas em **novos registros criados depois da ATT 03**. Nenhuma venda antiga é regravada para receber esse campo.

## 7. IMPACTO NOS DADOS DO CLIENTE

- Produtos existentes: **NÃO ALTERADOS**
- Clientes existentes: **NÃO ALTERADOS**
- Vendas existentes: **NÃO ALTERADAS**
- Estoques existentes: **NÃO ALTERADOS**
- Financeiro existente: **NÃO ALTERADO**
- Históricos existentes: **NÃO ALTERADOS**
- Configurações existentes: **NÃO ALTERADAS**

## 8. COMPATIBILIDADE

- Compatível com V1: **SIM**
- Fallback V1 preservado: **SIM**
- Rollback possível: **SIM**

O leitor aceita:
- ISO `createdAt` novo;
- `DD/MM/YYYY, HH:mm:ss` de pt-BR/es-ES;
- `MM/DD/YYYY, h:mm:ss AM/PM` legado en-US;
- Firestore Timestamp, caso apareça futuramente.

## 9. COMO FUNCIONAVA ANTES

`Vendido Hoje` usava o faturamento de todas as vendas válidas.

Comissão mensal tentava comparar:

```text
05/10/2026, 14:30:00.startsWith("2026-10")
```

Resultado: `false`.

Uma venda de R$ 100 com R$ 20 devolvidos podia continuar compondo comissão com faturamento R$ 100 e lucro bruto original.

## 10. COMO FUNCIONA AGORA

O ZenOS interpreta datas V1 em memória, sem alterar os registros. O cartão diário compara o dia de calendário local. O filtro mensal compara `YYYY-MM` derivado da data interpretada.

Novas vendas recebem:

```text
createdAt: 2026-10-05T17:30:00.000Z
dataHora: 05/10/2026, 14:30:00
```

`createdAt` é usado como fonte preferencial de cálculo; `dataHora` continua disponível para interface e compatibilidade.

A comissão usa `totalLiquidoBRL` e `lucroLiquidoBRL` quando há devoluções.

## 11. EXEMPLO PRÁTICO

### Vendido Hoje

Histórico:
- 04/10: R$ 1.000
- 05/10: R$ 300

Antes:
- Vendido Hoje: **R$ 1.300**

Agora em 05/10:
- Vendido Hoje: **R$ 300**

### Comissão

Venda original:
- total: R$ 100
- lucro: R$ 30

Após devolução:
- total líquido: R$ 80
- lucro líquido: R$ 20

Agora a comissão é calculada sobre R$ 20 de lucro líquido e margem líquida de 25%, e não sobre os R$ 30 originais.

## 12. TESTES EXECUTADOS

- `[OK]` ATT 01 — 21 verificações
- `[OK]` ATT 01.1 — 16 verificações
- `[OK]` ATT 02 — 10 grupos de verificações
- `[OK]` ATT 03 — 21 verificações
- `[OK]` datas pt-BR, es-ES e en-US
- `[OK]` ISO novo
- `[OK]` Firestore Timestamp compatível
- `[OK]` prioridade de `createdAt`
- `[OK]` dia atual x dia anterior
- `[OK]` mês correto x mês incorreto
- `[OK]` data impossível rejeitada
- `[OK]` venda concluída elegível
- `[OK]` venda parcial elegível pelo saldo líquido
- `[OK]` cancelada não gera comissão
- `[OK]` pré-pedido não gera comissão
- `[OK]` comissão usa valores líquidos
- `[OK]` PDV preserva `dataHora` e adiciona `createdAt`
- `[OK]` Mesas preserva `dataHora` e adiciona `createdAt`

## 13. TESTES NÃO EXECUTADOS

- Build Vite no container: **NÃO CONCLUÍDO** porque o ambiente não concluiu `npm ci`/instalação do Vite dentro do limite disponível.
- Build no Windows do usuário: **PENDENTE**.
- Teste funcional visual em homologação: **PENDENTE**.
- Firebase real: **NÃO EXECUTADO**.
- Produção: **NÃO EXECUTADO**.

## 14. RISCOS RESTANTES

1. A V1 ainda depende do relógio do dispositivo para criar `createdAt` ISO. Timestamp autoritativo de servidor fica para a arquitetura V2, onde cada venda será documento próprio.
2. Datas históricas sem AM/PM onde dia e mês são ambos <= 12 são inerentemente ambíguas. O ZenOS prioriza DD/MM/YYYY porque é o padrão histórico predominante de pt-BR/es-ES.
3. Uma devolução feita em mês posterior reduz o extrato histórico da comissão do mês original da venda. O ZenOS ainda não possui fechamento/pagamento imutável de comissão por competência.
4. Caixa/fiado/compras ainda não foram reconciliados pela ATT 03.

## 15. PRÓXIMA ATT RECOMENDADA

**ATT 04 — Caixa + Fiado / Livro Financeiro**, começando pelo mapa de entradas e saídas e sem criar ainda a V2 definitiva.

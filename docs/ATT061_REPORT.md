# RELATÓRIO DA ATT 06.1 — BLINDAGEM DE IDENTIDADE + ESTOQUE POR ORIGEM

## 1. ATT

- **ATT:** 06.1
- **Nome:** Blindagem de Identidade + Estoque por Origem
- **Objetivo:** impedir que um produto altere outro por colisão de identidade, segregar histórico por produto, remover dados demonstrativos automáticos de contas novas e tornar o aviso de Vitrine/Depósito completo no PDV.
- **Status:** código e testes lógicos concluídos; build Vite deve ser confirmado no Windows de homologação.

## 2. PROBLEMA CORRIGIDO

A ATT 06 revelou um defeito estrutural anterior: produtos sem `id` eram normalizados usando `Date.now()`. Produtos iniciais eram criados praticamente no mesmo instante e podiam compartilhar o mesmo ID. Como estoque, edição e histórico usavam esse ID, uma alteração em um produto podia atingir outro, transformar itens diferentes em cópias e misturar históricos.

Também foram corrigidos:
- produto rápido do PDV entrando automaticamente na Vitrine;
- alerta do PDV apenas quando o Depósito estava zerado;
- reprecificação do carrinho usando ID temporário da linha em vez do produto original;
- compras sem preflight de identidade;
- contas novas recebendo produtos/clientes demonstrativos automaticamente;
- histórico novo usando somente `produtoId`, insuficiente para registros legados com ID colidido.

## 3. ARQUIVOS ALTERADOS

- `src/data.js` — IDs seguros; IDs fixos para dados de demonstração; normalizadores deixam de depender somente de `Date.now()`.
- `src/App.jsx` — conta nova e fallback sem dados passam a nascer realmente vazios; nenhum produto/cliente demonstrativo é inserido automaticamente.
- `src/components/Produtos.jsx` — detecção visível de conflito de identidade, bloqueio de movimentação ambígua, SKU único, atualização de uma única identidade e histórico filtrado também por SKU.
- `src/components/PDV.jsx` — produto rápido normal entra no Depósito; venda preserva SKU original; reprecificação usa produto original; prévia e confirmação mostram consumo Vitrine/Depósito; venda bloqueia identidade ambígua.
- `src/components/PDVCompras.jsx` — SKU original preservado; criação/edição bloqueia SKU duplicado; preflight de identidade antes de entrada; agrupamento por ID + SKU.
- `src/components/Vendas.jsx` — devolução localiza produto por ID + SKU original.
- `src/core/inventory.js` — venda deixa de usar mapa simples por ID; localiza uma única identidade; adicionada prévia de origem da baixa.
- `src/core/stockAudit.js` — histórico novo usa chave de auditoria segregada e consulta legado com filtro por SKU.
- `src/core/stockAuditCore.js` — eventos passam a carregar `produtoAuditKey` e SKU original.
- `scripts/att06-check.mjs` — teste da ATT 06 atualizado para o aviso completo de origem.
- `package.json` — script `test:att061`.
- `docs/ZENOS_CHANGELOG.md` — registro da ATT.

## 4. ARQUIVOS CRIADOS

- `src/core/productIdentity.js`
- `scripts/att061-check.mjs`
- `docs/ATT061_REPORT.md`

## 5. ARQUIVOS REMOVIDOS

Nenhum.

## 6. BANCO DE DADOS

- **Banco de produção alterado:** NÃO
- **Dados existentes modificados:** NÃO
- **Dados existentes excluídos:** NÃO
- **IDs existentes alterados:** NÃO
- **Migração executada:** NÃO
- **Estrutura V2 adicionada:** NÃO

A ATT 06.1 não corrige automaticamente IDs duplicados já persistidos em produção. Quando encontra ambiguidade, bloqueia a ação para não alterar o registro errado.

## 7. IMPACTO NOS DADOS DO CLIENTE

- **Produtos existentes:** NÃO ALTERADOS EM LOTE
- **Clientes existentes:** NÃO ALTERADOS EM LOTE
- **Vendas existentes:** NÃO ALTERADAS
- **Estoques existentes:** NÃO ALTERADOS EM LOTE
- **Financeiro existente:** NÃO ALTERADO
- **Históricos existentes:** NÃO EXCLUÍDOS
- **Configurações existentes:** NÃO ALTERADAS

Contas novas deixam de receber dados demonstrativos automaticamente. Isso não remove itens de contas que já tenham dados salvos.

## 8. COMPATIBILIDADE

- **Compatível com V1:** SIM
- **Fallback V1 preservado:** SIM
- **Rollback possível:** SIM

Registros legados com o mesmo ID mas SKUs diferentes podem ser desambiguados pelo SKU. Duplicatas exatas (mesmo ID + mesmo SKU) são bloqueadas para revisão assistida.

## 9. COMO FUNCIONAVA ANTES

Exemplo estrutural:

```text
Produto A -> id 1791
Produto B -> id 1791
```

Uma movimentação fazia:

```text
produtos.map(p => p.id === 1791 ? produtoAtualizado : p)
```

Resultado: A e B podiam ser substituídos pelo mesmo objeto. O histórico também compartilhava a mesma coleção por `produtoId`.

Produto rápido no PDV com estoque 10 também nascia como:

```text
Vitrine 10
Depósito 0
```

mesmo sem o usuário escolher isso.

## 10. COMO FUNCIONA AGORA

Novos produtos usam identificadores robustos. Operações críticas utilizam ID + SKU original e exigem uma única correspondência.

Se houver ambiguidade:

```text
Conflito de identidade detectado
```

e a operação é bloqueada.

Produto normal criado no PDV:

```text
Vitrine 0
Depósito 10
Total 10
```

Se um produto tiver:

```text
Vitrine 2
Depósito 8
Total 10
```

e forem vendidas 5 unidades, o PDV informa antes:

```text
Baixa prevista: Vitrine 2 + Depósito 3
```

e antes de concluir a venda confirma que unidades da Vitrine serão utilizadas.

## 11. EXEMPLO PRÁTICO

### Identidade

ANTES:

```text
TINT-01 e PIGM-01 podiam compartilhar ID.
Alterar TINT-01 podia transformar/zerar PIGM-01.
```

AGORA:

```text
Cada novo registro recebe identidade própria.
Se dados legados ainda tiverem conflito, a alteração é bloqueada.
```

### Origem de estoque

```text
Vitrine: 2
Depósito: 8
Venda: 5
```

PDV informa:

```text
Vitrine 2 + Depósito 3
```

Após a venda:

```text
Vitrine: 0
Depósito: 5
Total: 5
```

## 12. TESTES EXECUTADOS

- ATT 01: 21/21 OK
- ATT 01.1: 16/16 OK
- ATT 02: 10 grupos OK
- ATT 03: 21/21 OK
- ATT 04: 24/24 OK
- ATT 06: 18/18 OK
- ATT 06.1: 18/18 OK

ATT 06.1 valida especificamente:
- IDs distintos nos padrões;
- geração em lote sem colisão;
- desambiguação por SKU;
- bloqueio de duplicata exata;
- detecção de conflito;
- histórico segregado por ID + SKU;
- venda altera somente o SKU correto mesmo com ID legado repetido;
- prévia Vitrine/Depósito;
- produto rápido entra no Depósito;
- aviso de Vitrine no PDV;
- SKU original preservado na venda;
- reprecificação usa produto original;
- compras fazem preflight de identidade;
- conta nova sem dados demonstrativos;
- histórico legado filtrado por SKU.

## 13. TESTES NÃO EXECUTADOS

- **Build Vite no container:** NÃO CONCLUÍDO. `npm ci` excedeu o limite do ambiente antes de disponibilizar o Vite.
- **Teste visual Windows:** PENDENTE.
- **Firebase real:** NÃO ACESSADO.
- **Produção real:** NÃO TESTADA.
- **Migração/reparo de IDs reais:** NÃO EXECUTADO.

## 14. RISCOS RESTANTES

1. Se uma base real já possuir duplicatas exatas de ID + SKU, a ATT bloqueia operações nesses itens, mas não apaga nem funde automaticamente. Será necessário diagnóstico e reparo assistido com backup.
2. Histórico criado antes da ATT 06.1 continua em caminho legado; a leitura tenta compatibilidade e filtra por SKU quando o evento possui SKU.
3. As regras Firestore reais de produção ainda precisam ser verificadas antes de qualquer deploy da trilha `estoque_auditoria`.
4. A arquitetura V1 ainda usa arrays no documento operacional; concorrência multi-terminal continua sendo risco para uma etapa posterior.

## 15. PRÓXIMA ATT RECOMENDADA

Somente após validar a ATT 06.1 no Windows:

1. testar conta nova realmente vazia;
2. cadastrar dois produtos diferentes e confirmar IDs/estoques independentes;
3. testar histórico isolado;
4. testar produto com Vitrine + Depósito;
5. testar venda usando ambas as origens;
6. testar compra e devolução;
7. simular conflito em homologação e confirmar bloqueio.

Depois disso, retomar a próxima frente funcional (Livro Financeiro/Caixa ou Motor de Comissões), sem avançar se houver qualquer regressão de identidade/estoque.

# ZenOS — Mapa de Dados V1

## Escopo
Mapa estático da base recebida para a ATT 01. Nenhuma leitura ou alteração foi feita em banco de produção.

## Firestore V1

### `lojas/{uid}`
Metadados de conta/loja. Campos observados no código: `email`, `status`, `dataCriacao`/`createdAt` e dados criados pelo fluxo de cadastro.

### `lojas/{uid}/dados/operacao`
Documento operacional único. Campos observados:
- `produtos`
- `clientes`
- `historicoVendas`
- `caixaMovimentos`
- `despesas`
- `historicoCompras`
- `fornecedores`
- `regrasDesconto`
- `vendedores`
- `sessoesCaixa`

As gravações automáticas da V1 continuam usando `setDoc(..., { merge: true })`. A ATT 01 não muda caminho, nomes de campos, IDs nem formato das entidades.

### `lojas/{uid}/dados/configuracoes`
Campos observados: `perfilLoja`.

### `solicitacoes_demo/{uid}`
Solicitações de demonstração autenticadas.

## Cache local isolado por usuário já existente
- `zenos_{uid}_produtos`
- `zenos_{uid}_clientes`
- `zenos_{uid}_historico_vendas`
- `zenos_{uid}_caixa_movs`
- `zenos_{uid}_despesas`
- `zenos_{uid}_historico_compras`
- `zenos_{uid}_fornecedores`
- `zenos_{uid}_regras_desconto`
- `zenos_{uid}_sessoes_caixa`
- `zenos_{uid}_vendedores`

## Chaves locais legadas/genéricas ainda observadas
- `zenos_produtos`
- `zenos_clientes`
- `zenos_historico_vendas`
- `zenos_mesas_ativas`
- `zenos_regras_comissao`
- `zenos_perfil_loja`
- `zenos_nome_loja`
- `zenos_schema_version`

Estas chaves NÃO foram removidas na ATT 01.

## Entidades e identificadores observados

### Produto
- Identificador principal: `id`
- Origem: `produtos[]` em `dados/operacao`
- Cache: `zenos_{uid}_produtos`
- Campos conhecidos incluem SKU, nome, tipo, unidade, grupo, custo, preços, estoque e dados fiscais.
- Campos adicionais/legados passam a ser preservados pelo normalizador da ATT 01.

### Cliente
- Identificador principal: `id`
- Origem: `clientes[]` em `dados/operacao`
- Cache: `zenos_{uid}_clientes`
- Campos conhecidos incluem identificação, contato, limite e saldo devedor.
- Campos adicionais/legados passam a ser preservados pelo normalizador da ATT 01.

### Venda
- Identificador: `id` (no PDV atual: rótulo + `Date.now()`)
- Origem: `historicoVendas[]`
- Cache: `zenos_{uid}_historico_vendas`
- Itens guardam uma linha de venda e podem conter `produtoOriginalId` além do `id` temporário da linha.

### Compra
- Identificador: gerado no fluxo de compra.
- Origem: `historicoCompras[]`
- Cache: `zenos_{uid}_historico_compras`

### Movimento de caixa
- Origem: `caixaMovimentos[]`
- Cache: `zenos_{uid}_caixa_movs`

### Sessão de caixa
- Origem: `sessoesCaixa[]`
- Cache: `zenos_{uid}_sessoes_caixa`

### Despesa
- Origem: `despesas[]`
- Cache: `zenos_{uid}_despesas`

### Fornecedor
- Origem: `fornecedores[]`
- Cache: `zenos_{uid}_fornecedores`

### Operador/vendedor
- Origem: `vendedores[]`
- Cache: `zenos_{uid}_vendedores`

### Mesas/comandas
- Origem atual: somente `localStorage` pela chave genérica `zenos_mesas_ativas`.
- Não é sincronizado pela estrutura operacional V1 neste código.

## Operações potencialmente destrutivas identificadas

### Reset granular em Configurações
`src/components/Configuracoes.jsx` permite, após reautenticação, substituir produtos/clientes pelos dados iniciais e zerar vendas, caixa e despesas selecionados. A ATT 01 não remove nem executa essa função. Deve receber backup obrigatório/guard rails em atualização específica.

### Exclusões lógicas em estado React
Há remoções de clientes, fornecedores, operadores e despesas por filtragem de arrays. Como os arrays são depois persistidos, isso pode resultar em remoção efetiva do registro da V1. Não foi alterado na ATT 01.

## Riscos estruturais V1 ainda abertos
1. Documento operacional único com arrays completos.
2. Concorrência entre terminais no mesmo campo/array.
3. Ausência de `onSnapshot`, transações e batch para os fluxos operacionais principais.
4. Ausência de regras Firestore no pacote recebido, impossibilitando certificação das permissões do projeto.
5. Ausência de suíte de testes automatizados no pacote original.
6. Chaves locais genéricas ainda presentes em módulos legados.
7. Reset granular destrutivo disponível na interface.
8. Mesas/comandas somente locais.

## Garantia ATT 01
A ATT 01 não cria V2, não move dados, não apaga V1, não altera IDs e não executa qualquer migração real.

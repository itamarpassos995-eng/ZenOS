# ATT 08 — Motor de Comissões, Metas e Bonificações

## 1. ATT

- **ATT:** 08
- **Nome:** Motor de Comissões, Metas e Bonificações
- **Objetivo:** permitir comissão configurável sobre lucro ou faturamento, manter o semáforo como proteção permanente da margem e adicionar múltiplas bonificações automáticas por metas.
- **Status:** lógica e regressão aprovadas; build Vite deve ser validado no Windows de homologação.

## 2. Problema / evolução tratada

A versão anterior calculava comissão somente sobre o lucro e possuía apenas percentuais por faixa de margem e bônus fixo por venda. O administrador não conseguia:

- escolher faturamento ou lucro como base;
- criar várias bonificações por metas;
- acompanhar automaticamente se cada meta foi atingida;
- sincronizar essas regras entre terminais;
- proteger uma comissão baseada em faturamento contra pagamento superior ao lucro da venda.

O semáforo precisava permanecer independente da base escolhida, conforme regra de negócio definida para preservar a saúde financeira da loja.

## 3. Arquivos alterados

### `src/App.jsx`
- Adicionado estado global `regrasComissao`.
- Leitura compatível de regras existentes na nuvem e do formato local legado.
- Sincronização V1 em tempo real do campo `regrasComissao`.
- Persistência protegida pelo mesmo gate `nuvemSincronizada` utilizado pelos demais domínios V1.
- Regras enviadas ao componente de Comissões por props.

### `src/components/Comissoes.jsx`
- Interface reorganizada para comissão, metas e bonificações.
- Seleção da base de comissão: lucro líquido ou faturamento líquido.
- Semáforo sempre ativo e visível.
- Proteção explícita de prejuízo.
- Cadastro de múltiplas regras de bonificação.
- Acompanhamento automático de progresso e qualificação.
- Relatório por vendedor com faturamento, lucro, margem, faixas, comissão, bônus e total.
- Nenhum `alert`, `confirm` ou `prompt` nativo introduzido.

### `scripts/att07-check.mjs`
- Ajustado somente para permitir que `Comissoes.jsx` deixe de ser byte a byte idêntico quando a ATT 08 estiver explicitamente presente.
- Todos os demais arquivos protegidos pela ATT 07 continuam exigindo os hashes originais.

### `package.json`
- Adicionado script `test:att08`.

### `docs/ZENOS_CHANGELOG.md`
- Registro desta ATT.

## 4. Arquivos criados

- `src/core/commissionEngine.js`
- `scripts/att08-check.mjs`
- `docs/ATT08_REPORT.md`

## 5. Arquivos removidos

Nenhum.

## 6. Banco de dados

- **Banco de produção acessado:** NÃO
- **Dados existentes modificados em produção:** NÃO
- **Dados existentes excluídos:** NÃO
- **IDs existentes alterados:** NÃO
- **Migração executada:** NÃO
- **V2 criada/ativada:** NÃO
- **Novo campo V1 preparado:** `regrasComissao` em `lojas/{uid}/dados/operacao`

Esse campo é aditivo. Caso não exista, o sistema usa as regras padrão ou tenta ler a configuração local legada de comissão. Nenhuma venda antiga é reescrita.

## 7. Impacto nos dados do cliente

- Produtos: NÃO ALTERADOS
- Clientes: NÃO ALTERADOS
- Vendas: NÃO ALTERADAS
- Estoques: NÃO ALTERADOS
- Caixa/Livro Financeiro: NÃO ALTERADOS
- Vouchers: NÃO ALTERADOS
- Histórico: NÃO ALTERADO
- Comissão histórica: calculada em leitura conforme o período, sem reescrever vendas

## 8. Compatibilidade

- Compatível com vendas V1: SIM
- Compatível com devoluções parciais: SIM
- Configuração local antiga de comissão: leitura de compatibilidade mantida
- Regras sincronizadas entre terminais: SIM, via campo V1 `regrasComissao`
- Rollback possível: SIM

## 9. Como funcionava antes

- Base da comissão fixa no lucro líquido.
- Percentuais verde/amarelo/vermelho.
- Bônus fixo por venda.
- Regras armazenadas apenas localmente pelo componente.
- Sem motor de várias metas/bonificações.

## 10. Como funciona agora

### Base configurável
O administrador escolhe:

- **Lucro líquido da venda**, ou
- **Faturamento líquido da venda**.

### Semáforo obrigatório
O semáforo continua classificando toda venda com as regras de margem já existentes, independentemente da base de comissão.

### Proteções financeiras
- Lucro zero ou prejuízo = comissão base zero.
- Comissão teórica nunca pode ultrapassar o lucro líquido positivo da própria venda.
- Uma configuração agressiva sobre faturamento é automaticamente limitada pelo lucro disponível naquela venda.

### Bonificações automáticas
Podem ser criadas várias regras independentes com critérios:

- faturamento mínimo;
- lucro mínimo;
- quantidade de vendas;
- ticket médio mínimo;
- margem média mínima;
- quantidade de vendas na faixa verde;
- zero devoluções no período.

Cada regra possui nome, meta, valor do bônus e status ativo/inativo.

O sistema calcula automaticamente:

- realizado;
- percentual de progresso;
- qualificado / em andamento;
- valor conquistado.

Metas numéricas iguais a zero não qualificam automaticamente.

## 11. Exemplos

### Comissão sobre lucro
Venda líquida: R$ 1.000
Lucro: R$ 300
Comissão verde: 10%

Resultado: R$ 30.

### Comissão sobre faturamento com proteção
Venda líquida: R$ 1.000
Lucro: R$ 30
Comissão configurada: 10% sobre faturamento
Comissão teórica: R$ 100

O ZenOS limita a comissão a R$ 30, evitando que a comissão isoladamente transforme a venda em prejuízo.

### Venda com prejuízo
Venda: R$ 100
Lucro: -R$ 10
Mesmo com comissão de 50% sobre faturamento:

Resultado da comissão: R$ 0.

### Bonificações
- Faturamento mínimo R$ 20.000 → bônus R$ 300
- 100 vendas → bônus R$ 100
- Margem média >= 35% → bônus R$ 150

Se o vendedor atingir as três, os três bônus são somados.

## 12. Testes executados

### Regressão acumulada
- ATT 01: 21/21 OK
- ATT 01.1: 16/16 OK
- ATT 02: 10 grupos OK
- ATT 03: 21/21 OK
- ATT 04: 24/24 OK
- ATT 06: 18/18 OK
- ATT 06.1: 18/18 OK
- ATT 06.2: 24/24 OK
- ATT 07: OK
- ATT 07.1: OK
- ATT 08: 20/20 OK

### ATT 08 valida especificamente
- base lucro;
- base faturamento;
- comissão zero em prejuízo;
- teto de comissão pelo lucro positivo;
- valores líquidos após devolução;
- limites de percentual;
- bônus atingido/não atingido;
- meta zero não qualifica automaticamente;
- bônus sem devoluções;
- múltiplos bônus acumulados;
- contagem por semáforo;
- identificação de vendas com prejuízo;
- sincronização cloud-first das regras;
- seletor lucro/faturamento;
- múltiplas bonificações na interface;
- zero diálogos nativos novos em Comissões.

## 13. Testes não executados

- **Build Vite no container:** NÃO CERTIFICADO. `npm ci` não concluiu corretamente no ambiente do assistente e o executável do Vite não ficou disponível.
- **Teste visual no navegador:** pendente para Windows de homologação.
- **Produção real:** NÃO TESTADA / NÃO ACESSADA.

## 14. Riscos restantes

- Bônus configurados pelo administrador são despesas gerenciais deliberadas e não são automaticamente limitados pelo lucro de cada venda. A proteção automática de teto desta ATT se aplica à comissão percentual por venda.
- A V1 ainda usa documento operacional compartilhado para algumas configurações. A sincronização em tempo real reduz divergências, mas a arquitetura final continua prevista para V2.
- O campo legado de percentual por operador em Configurações permanece intocado nesta ATT para evitar alteração de escopo; o motor oficial de comissão está centralizado no módulo Comissões.

## 15. Próxima ATT recomendada

Somente após validação funcional da ATT 08 em homologação. Nenhuma ATT seguinte deve ser iniciada antes de validar:

1. comissão sobre lucro;
2. comissão sobre faturamento;
3. venda com prejuízo;
4. semáforo nas três faixas;
5. criação e qualificação de várias bonificações;
6. sincronização das regras em duas abas/terminais.

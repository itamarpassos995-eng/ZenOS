# ATT 07.1 — Correção Crítica: Cadastro, Margem, Modais e Proteção de Dados

Data: 2026-10-06

## 1. ATT
- ATT: 07.1
- Nome: Correção Crítica de Cadastro, Margem, Modais e Proteção de Dados
- Base: ATT 07 cirúrgica reconstruída sobre a ATT 06.2 CORRIGIDA aprovada
- Objetivo: corrigir falhas reais encontradas em homologação sem expandir o escopo financeiro e sem criar regressões adicionais.
- Status: testes estáticos/lógicos e regressão completa aprovados; build Vite deve ser validado no Windows de homologação.

## 2. PROBLEMAS CORRIGIDOS

### 2.1 Cadastro de produto bloqueado por transação Firestore inválida
Sintoma real observado:
`Firestore transactions require all reads to be executed before all writes.`

Causa: a trava de unicidade da ATT 06.2 fazia `tx.get()` e `tx.set()` intercalados dentro da mesma transação. O Firestore exige que todas as leituras ocorram antes da primeira escrita.

Correção: `reservarIdentidadeProduto()` agora executa em três fases:
1. cria a lista de referências;
2. executa todas as leituras e validações;
3. somente depois executa todas as escritas.

Nenhum ID histórico foi alterado ou migrado.

### 2.2 Margem de 100% gerando Infinity
Causa: o cadastro usa margem sobre o preço de venda. Para custo positivo, 100% de margem nesse conceito exige divisão por zero e o preço tende ao infinito.

Correção:
- criado `src/core/pricing.js`;
- campo renomeado visualmente para `Margem sobre venda (%)`;
- faixa permitida: 0% a 99,9%;
- 100% ou mais é bloqueado com modal ZenOS;
- nenhuma operação pode exibir/gravar `Infinity`;
- exemplo visível: custo 10 + margem 40% = preço 16,67.

### 2.3 Pop-ups nativos nos fluxos críticos testados
Os componentes `Produtos`, `Clientes` e `PDV` tiveram `alert/confirm/prompt` nativos removidos dos fluxos corrigidos e passam a usar `ZenModal`.

Cobertos nesta corretiva:
- validações de cadastro de produto;
- estoque insuficiente;
- erros do PDV;
- autorização gerencial de margem;
- recebimento de cliente;
- confirmação de exclusão de cliente.

### 2.4 Proteção contra sobrescrita vazia após falha de leitura da nuvem
Risco identificado durante a revisão: se a leitura inicial do Firestore falhasse e não houvesse cache local, o App podia carregar arrays vazios e, ao marcar a nuvem como sincronizada, habilitar gravações V1. Em uma loja real isso poderia abrir uma janela para sobrescrever arrays existentes com vazio.

Correção fail-closed:
- toda autenticação inicia com gravações V1 bloqueadas;
- somente uma leitura autoritativa bem-sucedida libera `nuvemSincronizada`;
- falha de bootstrap mantém escritas bloqueadas;
- cache local pode ser exibido somente como fallback, sem permissão para sobrescrever a nuvem;
- somente snapshot remoto confirmado (`fromCache === false`) pode reabilitar gravações após reconexão;
- quando a nuvem não pode ser confirmada, o ZenOS mostra uma tela explícita `PROTEÇÃO DE DADOS ATIVA` e impede uso operacional que possa gravar vazio.

Essa proteção foi incluída especificamente para reduzir o risco em bases reais grandes, como lojas com centenas de produtos.

### 2.5 PIX e cartões no painel de caixa
PIX e cartão agora permanecem vinculados ao turno ativo para fins gerenciais, mas continuam com `afetaCaixaFisico = false`.

O painel `CAIXAS ABERTOS AGORA` mostra separadamente:
- dinheiro físico;
- PIX registrado;
- cartões registrados.

PIX/cartão NÃO entram no valor `Dinheiro físico circulando nos caixas`.

## 3. ARQUIVOS ALTERADOS NESTA CORRETIVA (ATT 07 -> ATT 07.1)

- `src/App.jsx`
  - proteção fail-closed do bootstrap da nuvem;
  - reabilitação de escritas somente após snapshot remoto confirmado.

- `src/components/Produtos.jsx`
  - margem segura;
  - modais ZenOS;
  - preflight de identidade;
  - liberação segura de reserva se cadastro inicial falhar.

- `src/components/Clientes.jsx`
  - remoção de pop-ups nativos nos fluxos corrigidos;
  - recebimentos vinculados ao turno também para PIX, sem afetar gaveta física.

- `src/components/PDV.jsx`
  - modais ZenOS nos fluxos críticos;
  - estoque insuficiente em modal próprio;
  - autorização gerencial de margem em modal próprio;
  - PIX/cartão associados ao turno para relatório, sem alterar gaveta.

- `src/components/GestaoCaixas.jsx`
  - linhas informativas de PIX e cartões por turno.

- `src/core/productRegistry.js`
  - transação Firestore corrigida: todas as leituras antes das escritas.

- `package.json`
  - script `test:att071`.

- `scripts/att07-check.mjs`
  - hash protegido atualizado apenas para refletir a correção justificada de Produtos.

## 4. ARQUIVOS CRIADOS
- `src/core/pricing.js`
- `scripts/att071-check.mjs`
- `docs/ATT071_REPORT.md`

## 5. ARQUIVOS REMOVIDOS
Nenhum.

## 6. BANCO DE DADOS
- Banco de produção acessado: NÃO
- Dados existentes modificados: NÃO
- Dados existentes excluídos: NÃO
- IDs existentes alterados: NÃO
- Migração executada: NÃO
- Catálogo real com 970 produtos acessado: NÃO
- Estrutura V2 ativada: NÃO

## 7. IMPACTO NOS DADOS DO CLIENTE
- Produtos existentes: NÃO MIGRADOS / NÃO REESCRITOS EM LOTE
- Clientes existentes: NÃO MIGRADOS
- Vendas existentes: NÃO ALTERADAS
- Estoques existentes: NÃO ALTERADOS
- Financeiro histórico: NÃO RECONSTRUÍDO
- IDs históricos: PRESERVADOS

A nova proteção de bootstrap bloqueia gravações se a leitura autoritativa da nuvem falhar.

## 8. COMPATIBILIDADE
- Compatível com V1: SIM
- Baseline ATT 06.2 aprovada preservada como origem: SIM
- ATT 07 financeira mantida: SIM
- Rollback possível: SIM
- Migração destrutiva: NÃO

## 9. COMO FUNCIONAVA ANTES

### Cadastro
A transação podia fazer leitura -> escrita -> nova leitura, sendo rejeitada pelo Firestore.

### Margem
100% podia alimentar a fórmula `custo / (1 - margem)` com denominador zero e exibir `Infinity`.

### Bootstrap
Uma falha de leitura podia deixar estado vazio em memória e posteriormente liberar persistência V1.

## 10. COMO FUNCIONA AGORA

### Cadastro
Todas as leituras e validações de duplicidade são concluídas antes de qualquer escrita transacional.

### Margem
Valores inválidos são bloqueados antes do cálculo/gravação; resultados não finitos nunca são aceitos.

### Nuvem
Sem confirmação autoritativa, o ZenOS entra em proteção e não escreve estado vazio na V1.

## 11. EXEMPLOS PRÁTICOS

### Margem
- custo = R$ 10
- margem = 40%
- preço = R$ 16,67

- custo = R$ 10
- margem = 100%
- resultado = BLOQUEADO, nunca Infinity.

### Falha da nuvem
- loja real contém 970 produtos;
- leitura inicial falha;
- ZenOS NÃO considera arrays vazios como estado sincronizado;
- persistência V1 permanece bloqueada;
- usuário vê proteção de dados ativa.

## 12. TESTES EXECUTADOS
Regressão completa executada após a correção:
- ATT 01: 21/21 OK
- ATT 01.1: 16/16 OK
- ATT 02: 10/10 grupos OK
- ATT 03: 21/21 OK
- ATT 04: 24/24 OK
- ATT 06: 18/18 OK
- ATT 06.1: 18/18 OK
- ATT 06.2: 24/24 OK
- ATT 07: OK
- ATT 07.1: 20/20 OK

ATT 07.1 inclui:
- margem 40% = R$ 16,67 para custo R$ 10;
- 100% bloqueado sem Infinity;
- leitura antes de escrita na transaction;
- simulação de catálogo com 970 produtos;
- preservação de 970 IDs;
- unicidade de IDs e chaves de identidade;
- zero conflito artificial na massa simulada;
- zero pop-up nativo em Produtos, Clientes e PDV nos fluxos corrigidos;
- estoque insuficiente via ZenModal;
- recebimento via ZenModal;
- PIX/cartão associados ao turno sem afetar caixa físico;
- proteção explícita contra bootstrap vazio;
- falha de bootstrap não libera escrita;
- snapshot de cache não libera escrita.

## 13. TESTES NÃO EXECUTADOS / NÃO CERTIFICADOS
- Build Vite no container: NÃO CERTIFICADO. O executável Vite não foi restaurado porque `npm ci` não concluiu dentro do ambiente disponível.
- Produção real: NÃO TESTADA.
- Catálogo real de 970 produtos: NÃO COPIADO/NÃO TESTADO por proteção dos dados; foi usada massa simulada de 970 registros.
- Regras Firestore reais: ainda devem ser auditadas antes de deploy.

O build e a homologação visual devem ser executados no Windows antes de qualquer consideração de produção.

## 14. RISCOS RESTANTES
- A V1 continua concentrando domínios operacionais em arrays no documento `dados/operacao`; concorrência total só será resolvida pela V2.
- Existem `alert/confirm/prompt` legados em outros módulos não pertencentes aos fluxos corrigidos; não foram ampliados nesta ATT. Devem ser substituídos de forma controlada em etapa própria.
- A subcoleção financeira e índices de produto exigem regras Firestore reais adequadas antes de produção.

## 15. PRÓXIMO PASSO RECOMENDADO
Não iniciar ATT 08 antes de:
1. `npm ci` no Windows;
2. regressão ATT01 -> ATT071;
3. `npm run build`;
4. teste visual do cadastro de produto;
5. teste de margem 40% / 100%;
6. teste de estoque insuficiente e recebimento sem pop-up nativo;
7. teste PIX no painel de caixas;
8. somente depois marcar ATT 07.1 como aprovada.

Nenhum deploy na base real está autorizado por este relatório.

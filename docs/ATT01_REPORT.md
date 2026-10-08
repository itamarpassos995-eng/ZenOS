# RELATÓRIO DA ATT 01

## 1. ATT

- ATT: 01
- Nome: Proteção e utilitários de persistência V1
- Objetivo: reduzir risco de perda silenciosa de dados sem alterar estrutura, IDs, regras comerciais ou banco de produção.
- Status: CONCLUÍDA NO CÓDIGO / BUILD COMPLETO NÃO VALIDADO NESTE AMBIENTE

## 2. PROBLEMA CORRIGIDO

Foram corrigidos três riscos de fundação:

1. As gravações automáticas da V1 em `App.jsx` descartavam erros com `.catch(()=>{})`, impedindo diagnóstico de falhas de sincronização.
2. O sistema alterava `zenos_schema_version` automaticamente e chamava isso de migração, embora nenhum dado fosse transformado.
3. `normalizarProduto()` e `normalizarCliente()` reconstruíam objetos apenas com campos conhecidos. Campos adicionais/legados podiam desaparecer da memória e depois ser regravados sem esses dados.

Consequência possível antes da ATT: perda silenciosa de campos adicionais e falsa impressão técnica de que uma migração/sincronização havia ocorrido corretamente.

## 3. ARQUIVOS ALTERADOS

### `src/App.jsx`
- Alteração: gravações automáticas de produtos, clientes, vendas, caixa, despesas, compras, fornecedores, regras, sessões e vendedores agora passam pela camada `persistV1OperationField()`.
- Motivo: remover falhas silenciosas e centralizar proteção sem mudar o caminho V1.
- Alteração: removida atualização automática de `zenos_schema_version` sem migração real; agora a versão é apenas inspecionada.
- Motivo: impedir marcação falsa de migração.

### `src/data.js`
- Alteração: `normalizarProduto()` e `normalizarCliente()` preservam o objeto original antes de normalizar campos conhecidos.
- Motivo: impedir descarte de campos adicionais/legados.

### `package.json`
- Alteração: adicionado script `test:att01`.
- Motivo: permitir verificação repetível da blindagem desta ATT.

## 4. ARQUIVOS CRIADOS

- `src/core/persistenceSafety.js`
- `docs/ZENOS_DATA_MAP_V1.md`
- `docs/ZENOS_CHANGELOG.md`
- `docs/ATT01_REPORT.md`
- `scripts/att01-static-check.mjs`

## 5. ARQUIVOS REMOVIDOS

Nenhum.

## 6. BANCO DE DADOS

- Banco de produção alterado: NÃO
- Dados existentes modificados: NÃO
- Dados existentes excluídos: NÃO
- IDs existentes alterados: NÃO
- Migração executada: NÃO
- Estrutura nova adicionada: NÃO NO BANCO

Foi criada apenas uma camada de código para continuar gravando na estrutura V1 existente quando o aplicativo for executado.

## 7. IMPACTO NOS DADOS DO CLIENTE

- Produtos existentes: NÃO ALTERADO; campos adicionais passam a ser preservados pelo normalizador.
- Clientes existentes: NÃO ALTERADO; campos adicionais passam a ser preservados pelo normalizador.
- Vendas existentes: NÃO ALTERADO.
- Estoques existentes: NÃO ALTERADO.
- Financeiro existente: NÃO ALTERADO.
- Históricos existentes: NÃO ALTERADO.
- Configurações existentes: NÃO ALTERADO.

## 8. COMPATIBILIDADE

- Compatível com V1: SIM
- Fallback V1 preservado: SIM
- Rollback possível: SIM

Não foi criada leitura V2, dual-write ou migração.

## 9. COMO FUNCIONAVA ANTES

Cada estado principal era salvo no cache local e depois enviado diretamente para `lojas/{uid}/dados/operacao` com `setDoc(..., { merge: true })`. Erros das gravações automáticas eram ignorados em vários pontos com `.catch(()=>{})`.

A inicialização também escrevia `zenos_schema_version = 1` mesmo sem executar qualquer transformação de dados.

Normalizadores retornavam apenas uma lista fechada de campos conhecidos.

## 10. COMO FUNCIONA AGORA

O mesmo caminho e os mesmos campos V1 continuam sendo usados. As gravações automáticas passam por `persistV1OperationField()`, que:

- salva o mesmo cache local por usuário;
- grava o mesmo campo no mesmo documento V1;
- mantém `{ merge: true }`;
- registra falha em vez de descartá-la;
- emite status técnico `SALVANDO`, `SALVO`, `PENDENTE` ou `ERRO` para futura UI de sincronização;
- não apaga, move ou migra dados.

A versão do schema é somente inspecionada. Nenhuma migração automática é executada.

Os normalizadores preservam campos desconhecidos/legados e continuam normalizando os campos conhecidos.

## 11. EXEMPLO PRÁTICO

ANTES

Um produto podia possuir:

```text
id: P-10
nome: Tinta X
estoque: 20
estoqueVitrine: 5
estoqueGalpao: 15
localizacao: A-03
campoLegado: valor
```

Ao passar pelo normalizador, campos não previstos na lista fechada podiam ser descartados.

AGORA

Os mesmos campos continuam presentes após normalização. `id`, preços e números conhecidos continuam normalizados, sem remover os campos adicionais.

## 12. TESTES EXECUTADOS

- [OK] 21 verificações estáticas da ATT 01.
- [OK] Nenhum `.catch(()=>{})` permanece nas gravações automáticas do `App.jsx`.
- [OK] Caminho V1 permanece `lojas/{uid}/dados/operacao`.
- [OK] `merge:true` permanece obrigatório na camada de persistência V1.
- [OK] Nenhum `deleteDoc` adicionado.
- [OK] Nenhum `deleteField` adicionado.
- [OK] Nenhum `localStorage.clear` adicionado.
- [OK] Nenhum `localStorage.removeItem` adicionado.
- [OK] Nenhuma estrutura V2 adicionada ao runtime.
- [OK] `App.jsx` não altera mais `zenos_schema_version` automaticamente.
- [OK] Teste de normalização confirmou preservação de `id`, `estoqueVitrine`, `estoqueGalpao`, `localizacao` e campos legados.
- [OK] Sintaxe dos novos arquivos JavaScript (`persistenceSafety.js` e `att01-static-check.mjs`) validada com `node --check`.
- [OK] Comparação contra o ZIP original confirmou que apenas os arquivos declarados nesta ATT foram alterados/criados, desconsiderando dependências temporárias de teste.

## 13. TESTES NÃO EXECUTADOS

- Build Vite completo: NÃO CONCLUÍDO.
  - Motivo: `npm ci` não concluiu a instalação no ambiente de execução e deixou o pacote Vite incompleto. A tentativa de `npm run build` falhou por ausência do executável Vite.
  - Este item NÃO está marcado como aprovado.
- Teste real contra Firestore de produção: NÃO EXECUTADO.
  - Motivo: proibido por esta ordem sem autorização explícita.
- Teste com dados reais de cliente: NÃO EXECUTADO.
- Teste em dois terminais reais: NÃO EXECUTADO.

## 14. RISCOS RESTANTES

1. Documento operacional V1 continua contendo arrays inteiros.
2. Concorrência entre dois terminais ainda pode sobrescrever alterações no mesmo array.
3. Devolução ainda possui o bug de identificação do produto e inconsistência financeira já auditados.
4. Datas/comissões ainda não foram corrigidas.
5. Estoque negativo/quantidade fracionada ainda não foram corrigidos.
6. Fiado ainda não gera extrato/movimento de caixa completo.
7. Mesas/comandas ainda dependem de chave local genérica.
8. Reset granular continua sendo uma operação destrutiva existente e precisa de backup/guard rails próprios.
9. Não há `firestore.rules` no pacote recebido; permissões do ambiente real não foram certificadas.
10. Não havia suíte de testes automatizados no projeto original.

## 15. PRÓXIMA ATT RECOMENDADA

ATT 02 — Devoluções.

Escopo recomendado:
- corrigir vínculo entre item da venda e `produtoOriginalId`;
- devolver estoque ao produto correto;
- registrar devolução como evento complementar sem reescrever a venda original;
- calcular valor bruto/devolvido/líquido e lucro líquido de forma compatível;
- remover as gravações legadas genéricas específicas do fluxo de devolução sem apagar chaves antigas;
- criar testes de devolução total, parcial, repetida e múltiplos itens.

Não iniciar automaticamente sem revisão deste relatório.

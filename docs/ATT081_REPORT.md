# RELATÓRIO DA ATT 08.1
## Correção e Auditoria de Não Regressão

### 1. ATT

- **ATT:** 08.1
- **Nome:** Correção de isolamento entre contas, recibo multimoeda, reembolso por caixa, estoque rápido, semáforo e layout de margem
- **Baseline:** ATT 08 imediatamente anterior
- **Status:** código corrigido; regressão lógica/estática aprovada; sintaxe/transpilação JS/JSX aprovada; build Vite pendente de confirmação no Windows de homologação

---

## 2. Problemas corrigidos

### 2.1 Perfil/logo de uma conta aparecendo em outra conta

**Causa encontrada:** o perfil visual da loja usava cache local genérico (`zenos_perfil_loja`) e o navegador mantém `localStorage` mesmo quando o Firebase Emulator é reiniciado. Portanto, uma conta nova criada no mesmo navegador podia nascer com nome/logo em RAM/cache pertencentes à conta anterior até a nuvem responder.

**Correção:**
- cache de perfil passa a ser obrigatório por UID: `zenos_{uid}_perfil_loja`;
- cache genérico de perfil não é mais lido;
- fallback offline operacional não lê mais chaves genéricas sem UID;
- regras de comissão locais passam a ser específicas do UID;
- mesas locais passam a ser específicas do UID;
- em login/troca/logout são zerados perfil, rascunho, câmbio e regras de margem em memória antes de aplicar dados da nova loja;
- quando a configuração da nova conta não existe na nuvem, o perfil é zerado e o cache daquele UID é removido.

**Resultado esperado:** Conta A pode ter nome/logo próprios. Conta B, no mesmo PC/navegador, nasce limpa e nunca deve receber a logo da Conta A.

---

### 2.2 Recibo com totais equivalentes nas moedas do sistema

**Correção:** novas vendas congelam um snapshot das cotações utilizadas no momento da venda. O cupom e a reimpressão passam a exibir equivalentes em BRL, USD, PYG e EUR quando houver cotação válida.

Também foi corrigido um ponto encontrado durante a auditoria: o troco mostrava o rótulo da moeda escolhida, mas podia formatar o valor como BRL. Agora o troco é formatado na própria moeda escolhida.

As cotações passam a ser persistidas por loja em:

`lojas/{uid}/dados/configuracoes.taxasCambio`

Assim duas lojas não compartilham câmbio e uma reimpressão pode usar o snapshot da venda em vez da cotação atual.

---

### 2.3 Devolução autorizada pelo administrador sem depender do caixa pessoal do administrador

**Problema:** a permissão de estornar é gerencial, mas o dinheiro físico não pertence conceitualmente à sessão pessoal do gerente. Um gerente sem saldo na própria gaveta não conseguia devolver em dinheiro mesmo quando havia outro caixa aberto com saldo.

**Correção:**
- a gerência continua sendo quem autoriza a devolução;
- para reembolso em dinheiro, a gerência escolhe qual **turno de caixa aberto** fornecerá o dinheiro físico;
- o sistema mostra operador do caixa e saldo físico esperado;
- o movimento de caixa e o Livro Financeiro ficam vinculados ao `sessaoId` escolhido;
- se nenhum caixa aberto possuir saldo suficiente, o ZenOS orienta utilizar Pix/Banco ou Voucher;
- não é permitido inventar saldo físico inexistente.

---

### 2.4 Cadastro rápido de produto pelo PDV com estoque diferente do Catálogo

**Problema:** o cadastro rápido tinha um único campo de estoque e alocava o saldo de forma diferente da ficha universal.

**Correção:** o cadastro rápido agora possui os mesmos conceitos físicos:
- **Vitrine / Loja**
- **Galpão / Depósito**

O total nasce como `Vitrine + Depósito`.

Para produto já existente, a edição rápida **não redistribui estoque**: preserva Vitrine e Depósito e deixa a movimentação física para o fluxo auditável do Catálogo.

Quando um novo produto rápido nasce com saldo inicial, é gerado evento `cadastro_inicial` no histórico de estoque.

---

### 2.5 Regressão do Semáforo de Lucratividade

**Causa encontrada:** contas novas/legadas podiam possuir `margemIdeal: 0` e `margemMinima: 0`. Nesse cenário toda venda aparecia verde (`>= 0%`). Além disso, a troca de conta não zerava todas as regras em RAM.

**Correção:**
- padrão seguro: margem ideal 30%, margem mínima 15%;
- regra 0/0 é tratada como vazia/corrompida e normalizada para 30/15;
- carregamento, realtime e fallback offline normalizam as regras antes de aplicar;
- troca/logout reseta as regras;
- tela de configuração não permite margem ideal zerada (mínimo 0,1%).

O motor de comissão da ATT 08 não foi alterado. O semáforo continua independente da base da comissão.

---

### 2.6 Desalinhamento visual do bloco de margem

O bloco de cadastro de produto foi reorganizado sem alterar sua lógica cadastral:

`Custo | Margem sobre venda | Preço Venda | Vitrine | Depósito`

Todos os rótulos possuem altura equivalente e todos os inputs possuem a mesma altura. A explicação sobre a margem foi retirada de dentro de uma única coluna e colocada abaixo do bloco inteiro.

---

### 2.7 Pop-up nativo encontrado durante a auditoria

No fluxo de reimpressão de cupom havia um `alert()` caso o navegador bloqueasse a nova janela. Ele foi substituído pelo modal visual ZenOS e o modal também é montado na tela de reimpressão.

Na edição rápida de nome/logo, arquivo de logo acima de 300 KB agora apresenta erro dentro da própria janela, sem `alert()` nativo.

A varredura global encontrou outros diálogos nativos **legados e preexistentes** em módulos não alterados nesta corretiva. Eles não foram ampliados nem convertidos em massa nesta ATT para evitar mudança de fluxo fora do escopo. Contagem global: 37 no baseline ATT 08 → 35 nesta ATT 08.1. PDV e Vendas ficam com zero diálogos nativos nos fluxos corrigidos.

---

## 3. Arquivos runtime alterados

- `src/App.jsx`
- `src/components/Configuracoes.jsx`
- `src/components/Mesas.jsx`
- `src/components/PDV.jsx`
- `src/components/Produtos.jsx`
- `src/components/Vendas.jsx`
- `src/core/profitability.js`
- `src/core/storeProfile.js`

### Arquivo runtime criado

- `src/core/receiptCurrency.js`

### Arquivos de testes/documentação alterados/criados

- `scripts/att011-static-check.mjs` — teste histórico atualizado para aceitar isolamento ainda mais forte (sem fallback genérico)
- `scripts/att061-check.mjs` — teste histórico atualizado para aceitar a evolução autorizada Vitrine/Depósito no cadastro rápido
- `scripts/att07-check.mjs` — mantém hashes protegidos, com exceções estritamente condicionadas à ATT 08.1
- `scripts/att081-check.mjs` — novo, 24 verificações
- `package.json` — adiciona `test:att081`
- `docs/ZENOS_CHANGELOG.md`
- `docs/ATT081_REPORT.md`
- `docs/ATT081_SOURCE_AUDIT.md`

### Arquivos removidos

**Nenhum.**

---

## 4. Banco de dados e integridade

- **Banco de produção acessado:** NÃO
- **Dados existentes modificados pelo desenvolvimento:** NÃO
- **Dados existentes excluídos:** NÃO
- **IDs existentes alterados:** NÃO
- **Migração executada:** NÃO
- **V2 ativada:** NÃO
- **Produtos reais do cliente tocados:** NÃO

A ATT é aditiva/compatível. As novas cotações somente são gravadas quando o usuário salva o câmbio. Novas vendas passam a guardar snapshot de câmbio; vendas antigas continuam válidas sem esse campo e usam fallback de configuração atual na visualização.

A única ocorrência de `deleteDoc` encontrada no `src/` continua sendo a rotina **preexistente** de liberação de reserva do índice de unicidade em `productRegistry.js`; ela não apaga produto/venda/cliente e não foi alterada nesta ATT.

---

## 5. Compatibilidade e não regressão

- **Compatível com V1:** SIM
- **Fallback V1 preservado:** SIM, agora somente por UID
- **Rollback possível:** SIM
- **Schema V2:** NÃO
- **Migração automática:** NÃO

Foi feita comparação SHA-256 arquivo a arquivo contra a ATT 08. Dos 44 arquivos do `src/`, somente os arquivos listados acima mudaram; os demais ficaram byte a byte idênticos. O inventário completo está em `docs/ATT081_SOURCE_AUDIT.md`.

---

## 6. Testes executados

### Regressão completa

- ATT 01: 21/21 OK
- ATT 01.1: 16/16 OK
- ATT 02: 10/10 grupos OK
- ATT 03: 21/21 OK
- ATT 04: 24/24 OK
- ATT 06: 18/18 OK
- ATT 06.1: 18/18 OK
- ATT 06.2: 24/24 OK
- ATT 07: OK
- ATT 07.1: OK, incluindo simulação de 970 produtos
- ATT 08: 20/20 OK
- ATT 08.1: 24/24 OK

### Validação sintática adicional

- 43 arquivos JS/JSX do `src/` analisados pelo parser/transpilador TypeScript.
- Resultado: **0 erros de sintaxe/transpilação**.

### Varreduras adicionais

- Nenhum `localStorage.clear()` novo.
- Nenhuma ativação V2.
- Nenhum arquivo `src/` removido.
- Nenhuma chave genérica de perfil/logo, comissão ou mesas encontrada no runtime corrigido.
- Nenhum novo `alert/confirm/prompt` nos arquivos alterados.

---

## 7. Testes não executados no container

### Build Vite completo

**NÃO CERTIFICADO no container.**

Motivo: `npm ci` não concluiu no ambiente do assistente e o executável Vite não ficou disponível. A sintaxe/transpilação foi validada separadamente, mas o gate final de `npm run build` deve ser executado no Windows de homologação antes de aprovação.

### Produção real

**NÃO EXECUTADA**, deliberadamente.

---

## 8. Teste funcional recomendado no Windows

1. Conta A: colocar nome/logo, salvar, sair.
2. Criar/entrar na Conta B no mesmo navegador: B deve nascer sem nome/logo da A.
3. Voltar à A: somente os dados de A devem reaparecer.
4. Configurar câmbio; realizar venda; cupom deve mostrar totais equivalentes nas moedas disponíveis.
5. Escolher troco em USD/PYG/EUR; o valor impresso deve estar na moeda escolhida.
6. Abrir dois turnos de caixa; gerente sem dinheiro próprio deve conseguir escolher o outro caixa com saldo para uma devolução em dinheiro.
7. Cadastrar produto rápido pelo PDV informando Vitrine e Depósito separadamente; conferir Catálogo e histórico.
8. Testar semáforo com margens acima de 30%, entre 15–30% e abaixo de 15%.
9. Abrir ficha de produto e conferir alinhamento Custo/Margem/Preço/Vitrine/Depósito.
10. Reimprimir cupom com bloqueio de popup para conferir que o aviso usa ZenModal.

---

## 9. Riscos restantes conhecidos

1. A arquitetura V1 ainda usa arrays inteiros em alguns domínios; a V2 continua necessária para eliminar totalmente concorrência estrutural.
2. Existem diálogos nativos legados em módulos não modificados nesta corretiva. Eles devem ser convertidos em uma ATT específica de padronização visual, sem misturar com regras financeiras/estoque.
3. Regras Firestore reais de produção continuam precisando ser conferidas antes de deploy das coleções/índices introduzidos nas ATT anteriores.
4. Nenhuma correção deve ser publicada em produção sem backup/export e teste de carga/cópia dos ~970 produtos do cliente.

---

## 10. Rollback

A ATT 08.1 não migra nem converte dados. Para rollback de código, restaurar o pacote ATT 08 imediatamente anterior. Não há rotina de rollback de banco porque nenhuma migração foi executada.

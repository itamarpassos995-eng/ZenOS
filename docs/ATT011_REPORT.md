# RELATÓRIO DA ATT 01.1

## 1. ATT

ATT: 01.1  
Nome: Ambiente Seguro de Homologação  
Objetivo: permitir testes completos do ZenOS em localhost sem utilizar Firebase, Analytics ou cache local de produção.  
Status: CÓDIGO CONCLUÍDO / TESTES ESTÁTICOS APROVADOS / BUILD E EMULADORES DEVEM SER VALIDADOS NO COMPUTADOR DE TESTE.

## 2. PROBLEMA CORRIGIDO

Antes desta ATT, executar o ZenOS em localhost utilizava a mesma configuração Firebase do sistema real `zenos-ac6b2`. Uma venda, alteração de produto, cadastro, reset ou outra operação feita durante testes poderia atingir dados reais caso fosse usada uma conta real.

Além disso, módulos como Vendas, Mesas, Comissões e Configurações utilizavam chaves locais genéricas. Portanto, mesmo sem gravar na nuvem, testes no mesmo navegador poderiam ler ou sobrescrever cache local de produção.

A ATT 01.1 cria um limite explícito entre PRODUÇÃO e HOMOLOGAÇÃO.

## 3. ARQUIVOS ALTERADOS

### src/firebase.js
Alteração: seleção de configuração por ambiente; localhost utiliza exclusivamente `demo-zenos-local`; Auth e Firestore são redirecionados aos emuladores; Analytics não é iniciado em homologação.  
Motivo: impedir qualquer acesso acidental ao Firebase real durante testes locais.

### src/main.jsx
Alteração: montagem global do banner de homologação.  
Motivo: tornar visualmente impossível confundir teste com produção.

### src/App.jsx
Alteração: cache local passa pelo namespace seguro e o fallback legado genérico fica bloqueado em homologação.  
Motivo: impedir mistura de dados locais de produção com testes.

### src/core/persistenceSafety.js
Alteração: persistência local utiliza a camada de storage isolada.  
Motivo: garantir que gravações automáticas da ATT 01 também respeitem o ambiente.

### src/components/Configuracoes.jsx
Alteração: perfil/nome da loja usam storage isolado.  
Motivo: testes não podem sobrescrever perfil local de produção.

### src/components/Vendas.jsx
Alteração: caches genéricos de produtos, clientes e histórico usam storage isolado.  
Motivo: impedir contaminação local durante testes de devolução/vendas.

### src/components/Mesas.jsx
Alteração: cache das mesas usa storage isolado.  
Motivo: separar comandas de teste das comandas eventualmente existentes no navegador de produção.

### src/components/Comissoes.jsx
Alteração: regras locais de comissão usam storage isolado.  
Motivo: preservar configuração local real.

### package.json
Alteração: `npm run dev` passa a iniciar Vite em modo homologação e foram adicionados `dev:test`, `emulators` e `test:att011`.  
Motivo: tornar o caminho seguro o padrão de desenvolvimento.

### docs/ZENOS_CHANGELOG.md
Alteração: registro da ATT 01.1.

## 4. ARQUIVOS CRIADOS

- `.firebaserc`
- `firebase.json`
- `firestore.emulator.rules`
- `src/core/runtimeEnvironment.js`
- `src/core/storage.js`
- `src/components/EnvironmentBanner.jsx`
- `scripts/att011-static-check.mjs`
- `docs/ATT011_REPORT.md`

## 5. ARQUIVOS REMOVIDOS

Nenhum.

## 6. BANCO DE DADOS

Banco de produção alterado: NÃO  
Dados existentes modificados: NÃO  
Dados existentes excluídos: NÃO  
IDs existentes alterados: NÃO  
Migração executada: NÃO  
Estrutura nova adicionada ao banco de produção: NÃO

A estrutura `demo-zenos-local` somente existe no emulador durante testes.

## 7. IMPACTO NOS DADOS DO CLIENTE

Produtos existentes: NÃO ALTERADOS  
Clientes existentes: NÃO ALTERADOS  
Vendas existentes: NÃO ALTERADAS  
Estoques existentes: NÃO ALTERADOS  
Financeiro existente: NÃO ALTERADO  
Históricos existentes: NÃO ALTERADOS  
Configurações existentes: NÃO ALTERADAS

## 8. COMPATIBILIDADE

Compatível com V1: SIM  
Fallback V1 preservado em produção: SIM  
Rollback possível: SIM

Em homologação, o fallback para chaves locais genéricas de produção é propositalmente bloqueado.

## 9. COMO FUNCIONAVA ANTES

`localhost:5173` inicializava o mesmo Firebase configurado para produção. O navegador também compartilhava as mesmas chaves locais genéricas utilizadas em alguns módulos.

## 10. COMO FUNCIONA AGORA

Quando o hostname é `localhost`, `127.0.0.1` ou `::1`, ou quando o Vite roda no modo `homologacao`:

- projeto Firebase lógico: `demo-zenos-local`;
- Auth: `127.0.0.1:9099`;
- Firestore: `127.0.0.1:8080`;
- Emulator UI: `127.0.0.1:4000`;
- Analytics: desligado;
- localStorage: prefixado com `zenos_hml__`;
- banner: MODO TESTE / HOMOLOGAÇÃO.

Em domínio de produção, a configuração V1 `zenos-ac6b2` permanece igual.

## 11. EXEMPLO PRÁTICO

ANTES:

- abrir localhost;
- entrar com conta real;
- editar um produto;
- risco de gravar no projeto real `zenos-ac6b2`.

AGORA:

- abrir localhost;
- ZenOS seleciona `demo-zenos-local` automaticamente;
- conta criada no teste existe somente no Auth Emulator;
- produto alterado existe somente no Firestore Emulator/localStorage `zenos_hml__*`;
- produção permanece intocada.

## 12. TESTES EXECUTADOS

[OK] ATT 01 permaneceu aprovada: 21/21 verificações.  
[OK] localhost força homologação.  
[OK] homologação usa `demo-zenos-local`.  
[OK] produção mantém `zenos-ac6b2`.  
[OK] Auth usa emulator em homologação.  
[OK] Firestore usa emulator em homologação.  
[OK] Analytics não inicia em homologação.  
[OK] banner global foi montado.  
[OK] storage operacional não usa diretamente localStorage fora da camada isolada.  
[OK] namespace `zenos_hml__` existe.  
[OK] cache legado genérico é bloqueado em homologação.  
[OK] `npm run dev` inicia em modo homologação.  
[OK] `.firebaserc` aponta para `demo-zenos-local`.  
[OK] nenhum `deleteDoc` foi introduzido.  
[OK] nenhum `deleteField` foi introduzido.  
[OK] arquivos JavaScript não-JSX novos passaram por verificação de sintaxe do Node.

## 13. TESTES NÃO EXECUTADOS

Build Vite da ATT 01.1 neste ambiente: NÃO CONCLUÍDO.  
Motivo: a reinstalação de `node_modules` no container expirou por timeout de transporte; o diretório não possuía Vite previamente.

Firebase Emulator executado neste ambiente: NÃO.  
Motivo: depende do Firebase CLI/Java e deve ser validado no computador de desenvolvimento.

Teste real em produção: NÃO EXECUTADO.  
Motivo: proibido por esta ordem de serviço.

## 14. RISCOS RESTANTES

- A execução do Firestore Emulator exige ambiente compatível com Firebase CLI e Java.
- As regras `firestore.emulator.rules` são destinadas somente ao projeto demo local e não substituem uma futura auditoria das regras reais de produção.
- Os bugs de devolução, comissão, caixa, fiado, estoque negativo e concorrência permanecem para as próximas ATT.
- O módulo Mesas continua funcionalmente local; nesta ATT apenas seu cache foi isolado entre produção e homologação.

## 15. PRÓXIMA ATT RECOMENDADA

Após validar no computador de desenvolvimento:

1. `npm.cmd run test:att01`
2. `npm.cmd run test:att011`
3. `npm.cmd run build`
4. `npm.cmd run dev:test`
5. criar conta fictícia no ambiente local;
6. confirmar banner MODO TESTE;
7. fazer uma alteração fictícia e conferir no Emulator UI.

Com o laboratório validado, seguir para ATT 02 — Devoluções, sem alterar histórico real.

# ATT 08.2 — PIN Gerencial, Modais, Browser e Reconciliação de Caixa

Data: 2026-10-06
Base: ATT 08.1 aprovada em homologação.

## Objetivo
Corrigir quatro achados da homologação sem alterar regras aprovadas de estoque, comissões, multiusuário, voucher ou financeiro:
1. popup nativo ainda presente no encerramento de sessão;
2. PIN do administrador não reconhecido na autorização de margem;
3. navegador interpretando PINs internos como senha da conta/site;
4. devolução total podendo deixar caixa em `-R$ 60` por remover a entrada original da venda cancelada e manter somente a saída do estorno.

## Causa raiz — autorização gerencial
O PDV comparava a autorização de margem contra `regrasDesconto.senhaGerente` (default legado `1234`) enquanto o administrador principal do terminal usa `senha: admin`. Eram duas fontes de senha concorrentes.

### Correção
Criado `src/core/accessControl.js`.
Uma credencial gerencial agora é o PIN de um operador que seja:
- administrador principal (`id=admin`);
- patente `gerencia`; ou
- tenha `permissoes.admin=true`.

A senha legada de regra só é aceita para compatibilidade quando não existe nenhum operador gerencial cadastrado.

Configurações agora permite alterar o PIN de cada operador, inclusive o administrador principal, sem exibir o PIN atual em texto claro. O administrador principal não pode ser removido nem rebaixado.

## Browser / Gerenciador de Senhas
PINs internos do Terminal, autorização de margem, exclusão de produto e edição de PIN não usam mais `type=password` como se fossem a senha da conta web. Eles usam campo textual mascarado (`WebkitTextSecurity`) com `autocomplete=one-time-code` e marcas de ignore para gerenciadores conhecidos.

A senha real da conta Firebase, usada apenas na zona de restauração destrutiva, continua sendo um campo de senha legítimo.

## Modais
O encerramento da sessão principal passou de `window.confirm()` para `ZenModal`.
Também foram removidos os diálogos nativos restantes em runtime nos componentes antigos (Compras, Fornecedores, Configurações, Migração, Login legado e Despesas).

Resultado da varredura:
`alert/confirm/prompt` nativos em `src`: **0**.

## Caixa e devolução
### Bug encontrado
Uma venda de R$ 60 em dinheiro gerava +R$ 60 na gaveta. Na devolução total, a venda mudava para `cancelada`. O resumo de caixa deixava de considerar a entrada da venda cancelada, enquanto a saída de devolução de R$ 60 continuava registrada. Resultado incorreto: `0 - 60 = -60`.

### Correção
Venda cancelada que possui pagamentos efetivamente liquidados continua compondo o fluxo histórico de entrada do caixa. A devolução permanece como saída independente.

Exemplo:
- Fundo: R$ 0
- Venda cash: +R$ 60
- Devolução cash: -R$ 60
- Saldo esperado: **R$ 0**

Não é aplicado `Math.max(0)` para esconder diferença. O saldo é reconciliado pelos eventos reais.

A devolução em dinheiro também revalida o saldo do caixa imediatamente antes de registrar o estorno. Se o saldo tiver mudado, a operação é bloqueada e exige outro caixa, Pix/Banco ou Voucher.

Sangria acima do saldo físico passou a ser bloqueada; não existe mais confirmação para permitir caixa negativo.

## Arquivos alterados em relação à ATT 08.1
- package.json
- src/App.jsx
- src/core/cashSession.js
- src/components/Produtos.jsx
- src/components/Vendas.jsx
- src/components/Despesas.jsx
- src/components/Login.jsx
- src/components/Migracao.jsx
- src/components/TerminalLogin.jsx
- src/components/Configuracoes.jsx
- src/components/Fornecedores.jsx
- src/components/PDVCompras.jsx
- src/components/PDV.jsx

## Arquivos criados
- src/core/accessControl.js
- scripts/att082-check.mjs
- docs/ATT082_REPORT.md

## Arquivos removidos
Nenhum.

## Banco de dados
Banco de produção acessado: NÃO
Dados existentes modificados: NÃO
Dados existentes excluídos: NÃO
IDs existentes alterados: NÃO
Migração executada: NÃO
V2 ativada: NÃO

## Testes
Regressão completa executada e aprovada:
- ATT 01: 21/21
- ATT 01.1: 16/16
- ATT 02: 10 grupos
- ATT 03: 21/21
- ATT 04: 24/24
- ATT 06: 18/18
- ATT 06.1: 18/18
- ATT 06.2: 24/24
- ATT 07: aprovado
- ATT 07.1: aprovado
- ATT 08: 20/20
- ATT 08.1: 24/24
- ATT 08.2: 19/19

ATT 08.2 cobre explicitamente:
- PIN `admin` reconhecido como gerencial;
- permissão Admin reconhecida como patente efetiva de gerência;
- senha legada não contorna operador gerencial existente;
- alteração de PIN disponível em Configurações;
- navegador não trata PIN interno como senha de login;
- logout usa ZenModal;
- zero alert/confirm/prompt em `src`;
- venda cancelada mantém entrada física histórica;
- venda R$60 + devolução R$60 = caixa R$0;
- revalidação de saldo antes do estorno;
- sangria não cria caixa negativo.

## Teste não executado neste ambiente
Build Vite: NÃO CERTIFICADO. `npm ci` no container excedeu o limite antes de disponibilizar o Vite. Deve ser executado no Windows de homologação com `npm.cmd run build`.

## Riscos restantes
- PINs de operadores continuam armazenados no formato legado da V1 para compatibilidade. Hash/credenciais por documento devem ser tratados na V2, sem migração destrutiva.
- A senha real da conta Firebase continua separada dos PINs internos dos operadores.

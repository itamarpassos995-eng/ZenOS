# ZenOS — Auditoria de Storage V1 (ATT 09)

## Objetivo
Auditar o armazenamento local sem apagar ou migrar silenciosamente dados existentes. O Firestore continua sendo a fonte autoritativa; o storage local é somente cache/fallback por conta e ambiente.

## Resultado executivo
- Chamadas diretas a `localStorage`: **somente `src/core/storage.js`**.
- `localStorage.clear()`: **não existe**.
- `sessionStorage`: **não utilizado** no runtime atual.
- `indexedDB`: **não utilizado diretamente pelo ZenOS**. O SDK Firebase pode usar mecanismos internos próprios, fora do controle deste módulo.
- Dados de negócio: chaves **isoladas por UID**.
- Homologação: todas as chaves recebem adicionalmente o prefixo de runtime `zenos_hml__`, impedindo colisão com produção no mesmo navegador.
- Produção preserva os nomes UID-específicos já existentes para não quebrar cache de clientes atuais.

## Chaves auditadas

| Chave lógica | Arquivo/Origem | Finalidade | Escopo | Situação ATT 09 |
| --- | --- | --- | --- | --- |
| `zenos_schema_version` | `core/persistenceSafety.js` | versão local de schema | aplicação/ambiente | segura como chave global; não contém dados de loja |
| `zenos_{uid}_produtos` | `App.jsx` / persistence | cache produtos | loja/conta | UID isolado |
| `zenos_{uid}_clientes` | `App.jsx` / persistence | cache clientes | loja/conta | UID isolado |
| `zenos_{uid}_historico_vendas` | `App.jsx` / persistence | cache vendas | loja/conta | UID isolado |
| `zenos_{uid}_caixa_movs` | `App.jsx` / persistence | cache movimentos de caixa | loja/conta | UID isolado |
| `zenos_{uid}_despesas` | `App.jsx` / persistence | cache despesas | loja/conta | UID isolado |
| `zenos_{uid}_historico_compras` | `App.jsx` / persistence | cache compras | loja/conta | UID isolado |
| `zenos_{uid}_fornecedores` | `App.jsx` / persistence | cache fornecedores | loja/conta | UID isolado |
| `zenos_{uid}_vouchers` | `App.jsx` / persistence | cache vouchers | loja/conta | UID isolado |
| `zenos_{uid}_sessoes_caixa` | `App.jsx` / persistence | cache turnos | loja/conta | UID isolado |
| `zenos_{uid}_regras_desconto` | `App.jsx` / persistence | cache margem/desconto | loja/conta | UID isolado |
| `zenos_{uid}_regras_comissao` | `App.jsx` / persistence | cache comissão/metas | loja/conta | UID isolado |
| `zenos_{uid}_vendedores` | `App.jsx` / persistence | cache operadores | loja/conta | UID isolado |
| `zenos_{uid}_perfil_loja` | `core/storeProfile.js` | cache nome/logo/impressão | loja/conta | UID isolado |
| `zenos_{uid}_mesas_ativas` | `Mesas.jsx` | legado anterior à ATT 09 | loja/conta | somente leitura para importação segura; não recebe novas gravações |

## Regra de ambiente
`src/core/runtimeEnvironment.js` aplica namespace adicional em homologação:

- Homologação: `zenos_hml__zenos_{uid}_...`
- Produção: preserva `zenos_{uid}_...` para compatibilidade com clientes atuais.

Não foi feita renomeação em massa de cache de produção porque isso poderia eliminar o fallback de uma loja já instalada. A segurança entre lojas vem do UID obrigatório; a separação homologação/produção vem do namespace de runtime.

## Compatibilidade com chaves antigas
A ATT 09 não executa migração genérica de chave sem proprietário conhecido. O único legado operacional lido explicitamente é `zenos_{uid}_mesas_ativas`, porque já contém o UID do proprietário. Ele é importado para o documento Firestore de Mesas quando este ainda não existe e **não é removido automaticamente**.

Chave sem UID ou com propriedade ambígua: **não deve ser importada automaticamente**.

## Testes de isolamento exigidos
1. Conta A configura nome/logo e dados locais.
2. Logout.
3. Conta B, no mesmo navegador, não pode ver qualquer vestígio da A.
4. Conta B recebe seus próprios dados.
5. Voltar para A restaura somente os dados de A.
6. A e B em perfis/navegadores separados não podem compartilhar cache.

Esse teste A/B já havia sido aprovado na ATT 08.1 e continua coberto na regressão da ATT 09.

## Riscos restantes
- O cache V1 continua armazenando arrays grandes porque a arquitetura V1 ainda existe. A ATT 09 não converte isso para V2.
- Produção mantém nomenclatura histórica `zenos_{uid}_...` por compatibilidade, em vez de renomear para `zenos_prod_{uid}_...`.
- O storage local não é fonte de verdade. Se a leitura autoritativa da nuvem falhar, a proteção de bootstrap impede gravação de arrays vazios de volta ao Firestore.

# RELATÓRIO ATT 09 — BLINDAGEM FINAL DA V1

## 1. Identificação

- **ATT:** 09
- **Nome:** Blindagem Final da V1 antes da V2
- **Baseline:** ZenOS ATT 08.3 aprovada
- **SHA-256 da baseline:** `101dd7730c041a7b3294b9c2aa49880c498619d7ac8ee5fe5dc290aabcb60e25`
- **Build da baseline:** APROVADO no Windows do usuário em 07/10/2026 (`✓ built in 33.38s`)
- **Status atual ATT 09:** **CANDIDATO DE VALIDAÇÃO (RC)** — regressão estática/lógica aprovada; build ATT 09 e teste Emulator real ainda precisam ser executados no Windows antes de a ATT 09 ser declarada FINAL/APROVADA.

A produção real não foi acessada.

---

## 2. Arquivos alterados

### `src/App.jsx`
**Alteração:** indicador global verdadeiro de sincronização, agregando estado por domínio; proteção offline/erro; troca obrigatória de PIN temporário; persistência do PIN somente após confirmação cloud; timestamps em configurações; integração dos props de backup/Mesas; proteção de bootstrap preservada.

**Motivo:** impedir falso “Sincronizado”, eliminar permanência de PIN padrão e preservar a proteção contra escrita vazia após falha de leitura.

### `src/components/Configuracoes.jsx`
**Alteração:** Backup/Validação/Restauração somente em homologação; zona destrutiva condicionada a backup validado; criação/troca de PIN com hash; timestamps de configuração.

**Motivo:** cumprir backup restaurável, proteção antes de limpeza e segurança definitiva de credenciais.

### `src/components/Mesas.jsx`
**Alteração:** Mesas deixam de gravar localStorage; passam a assinar `dados/mesas` em realtime; alterações usam transação; cache legado UID-específico é somente importado quando não existe documento cloud; banner EXPERIMENTAL.

**Motivo:** impedir estado local divergente e overwrite simples entre terminais, sem fingir que o módulo está pronto comercialmente.

### `src/components/TerminalLogin.jsx`
**Alteração:** verificação assíncrona de PIN compatível com hash PBKDF2 e legado; orientação de troca do PIN temporário.

**Motivo:** remover dependência de PIN em texto puro.

### `src/core/accessControl.js`
**Alteração:** autorização gerencial assíncrona por credencial segura; fallback legado somente se não houver gerente cadastrado.

**Motivo:** permitir PIN com hash sem backdoor permanente.

### `src/components/Produtos.jsx`
**Alteração:** fluxo gerencial aguarda validação assíncrona do PIN.

**Motivo:** compatibilidade com PIN seguro sem mudar regra de exclusão/inativação.

### `src/components/PDV.jsx`
**Alteração:** autorização de margem aguarda validação assíncrona do PIN.

**Motivo:** preservar regra aprovada de margem usando nova credencial segura.

### `src/core/persistenceSafety.js`
**Alteração:** `serverTimestamp()` em `_syncMeta`; status `SINCRONIZADO` apenas após `setDoc` confirmado; função pública de notificação de sincronização.

**Motivo:** indicador verdadeiro de persistência.

### `src/core/financialLedger.js`
**Alteração:** `serverRecordedAt`; eventos de sincronização; listener informa se snapshot veio do cache.

**Motivo:** timestamp confiável e indicador cloud real.

### `src/core/stockAudit.js`
**Alteração:** `serverRecordedAt` para eventos de estoque e estados de sincronização.

**Motivo:** timestamp confiável de trilha auditável.

### `src/core/productRegistry.js`
**Alteração:** timestamp do servidor nos índices; falha de exclusão de índice deixa de ser silenciosa e passa a reportar erro de sincronização.

**Motivo:** remover persistência silenciosa e melhorar rastreabilidade.

### `src/core/runtimeEnvironment.js`
**Alteração:** reconhece execução Node dentro do Firebase Emulator como homologação.

**Motivo:** permitir teste automatizado real de restauração sem abrir qualquer caminho de restauração em produção.

### `scripts/att07-check.mjs`
**Alteração:** exceção controlada para `stockAudit.js` somente quando os marcadores da ATT 09 estão presentes.

**Motivo:** o teste da ATT 07 protegia byte a byte um arquivo que a ATT 09 foi explicitamente autorizada a evoluir para timestamp/sync. Os asserts funcionais não foram reduzidos.

### `scripts/att081-check.mjs`
**Alteração:** aceita metadados adicionais de timestamp em `configuracoes` na presença da ATT 09.

**Motivo:** evolução autorizada sem relaxar a validação do isolamento/câmbio.

### `scripts/att082-check.mjs`
**Alteração:** asserts de credencial gerencial tornados assíncronos.

**Motivo:** PIN agora usa derivação criptográfica assíncrona. O comportamento esperado continua o mesmo.

### `package.json`
**Alteração:** adicionados `test:att09` e `test:att09:emulator`.

**Motivo:** gates reproduzíveis da ATT 09.

---

## 3. Arquivos criados

- `src/core/backupCore.js`
- `src/core/backupRecovery.js`
- `src/core/operatorPin.js`
- `src/core/tablesV1.js`
- `scripts/att09-check.mjs`
- `scripts/att09-emulator-check.mjs`
- `docs/ZENOS_STORAGE_AUDIT.md`
- `docs/ZENOS_BACKUP_RECOVERY.md`
- `docs/ZENOS_MESAS_AUDIT.md`
- `docs/ATT09_REPORT.md`
- `docs/ATT09_BASELINE_HASHES.json`
- `docs/ATT09_DIFF_MANIFEST.json`

---

## 4. Arquivos removidos

**Nenhum.**

---

## 5. Banco

- **Banco de produção acessado:** NÃO
- **Dados de produção alterados:** NÃO
- **Dados excluídos:** NÃO
- **IDs existentes alterados:** NÃO
- **Migração executada:** NÃO
- **V2 criada:** NÃO
- **Dual-write V2:** NÃO
- **Shadow mode V2:** NÃO

---

## 6. Backup

### Formato
`ZENOS_V1_BACKUP_1` em JSON.

### Entidades
- documento raiz da loja;
- operação V1 completa;
- configurações;
- Mesas/Comandas;
- Livro Financeiro;
- índices de unicidade de produto;
- auditoria de estoque acessível a partir dos produtos V1.

### Contagens
A validação recalcula as contagens do conteúdo e compara com o manifesto declarado.

### Checksum
SHA-256 sobre representação canônica do backup.

### Testes já executados
- 970 produtos: quantidade preservada;
- 500 clientes;
- 5.000 vendas;
- checksum íntegro;
- alteração proposital do conteúdo invalida checksum;
- restauração lógica em memória preserva conteúdo e IDs;
- estresse: 1.000 produtos + 500 clientes + 5.000 vendas.

### Teste de restauração real
Script criado: `npm.cmd run test:att09:emulator`.

**Status neste ambiente:** NÃO EXECUTADO por falta das dependências Firebase instaladas no container. É gate obrigatório no Windows de homologação antes de aprovação FINAL.

### Risco conhecido
Auditoria de estoque órfã de produto fisicamente removido por versões antigas pode não ser enumerável pelo SDK web. Detalhado em `ZENOS_BACKUP_RECOVERY.md`. Nenhum dado foi apagado para contornar essa limitação.

---

## 7. Storage

- **Chamadas diretas a localStorage fora do wrapper:** 0
- **`localStorage.clear()`:** 0
- **`sessionStorage` operacional:** 0
- **`indexedDB` direto pelo ZenOS:** 0
- **Chaves lógicas auditadas:** 15
- **Chaves operacionais globais entre lojas:** 0
- **Chave global segura:** `zenos_schema_version` (não contém dados de loja)
- **Mesas legado:** `zenos_{uid}_mesas_ativas`, somente leitura/importação quando cloud inexistente.

Produção preserva nomes de cache UID-específicos para compatibilidade. Homologação adiciona prefixo `zenos_hml__`.

Documento detalhado: `ZENOS_STORAGE_AUDIT.md`.

---

## 8. Sincronização

### Estados globais
- SALVANDO
- SINCRONIZADO
- PENDENTE
- OFFLINE
- ERRO

### Regra
O estado é agregado por domínio. Um sucesso posterior em outro domínio não esconde uma falha já pendente.

### Confirmação cloud
`persistV1OperationField` só emite `SINCRONIZADO` após `await setDoc` concluído.

### Realtime
- operação V1;
- configurações;
- Livro Financeiro;
- Mesas/Comandas ATT 09.

Snapshots vindos de cache não são tratados como confirmação autoritativa nos pontos alterados.

### Proteção contra nuvem vazia
Preservada: falha de bootstrap nunca libera gravação de arrays vazios. `PROTEÇÃO DE DADOS ATIVA` permanece.

### Multiterminal
Script `test:att09:emulator` testa duas instâncias Firebase simultâneas para Mesas e concorrência por transação.

**Execução real no Emulator:** pendente no Windows antes da aprovação FINAL.

---

## 9. Credenciais

### PIN padrão
O admin legado `admin` continua sendo reconhecido apenas para que contas antigas não sejam bloqueadas, mas recebe `pinTrocaObrigatoria` e não pode permanecer como credencial definitiva.

### Primeiro acesso
Operador com credencial legada em texto puro é obrigado a definir novo PIN após autenticação.

### Regras fracas bloqueadas
- admin
- 1234
- 0000
- 1111
- senha
- password
- repetições triviais;
- sequências simples.

### Armazenamento novo
- PBKDF2-HMAC-SHA256;
- salt aleatório de 128 bits;
- 120.000 iterações;
- hash de 256 bits;
- PIN original não é salvo;
- `senha: null` após migração.

Compatibilidade de eventual hash ATT09 v1 SHA-256 foi mantida no verificador somente para não invalidar homologações intermediárias.

### Persistência
Troca obrigatória só libera o terminal depois que o campo `vendedores` foi confirmado na nuvem.

### Recuperação
Nenhum PIN mestre/backdoor novo foi criado. Recuperação administrativa da conta continua dependente da autenticação principal Firebase.

---

## 10. Timestamps

### Auditados
- operação V1;
- Livro Financeiro;
- auditoria de estoque;
- índice de produtos;
- configurações;
- Mesas.

### Novos metadados confiáveis
Nos documentos Firestore alterados/aditivos foram usados `serverTimestamp()` quando tecnicamente permitido.

### Arrays V1
Elementos dentro dos arrays V1 continuam preservando seus campos ISO/client-side históricos; a ATT 09 **não reescreve registros antigos** nem introduz sentinelas incompatíveis em arrays. A confirmação de persistência do documento recebe `_syncMeta.updatedAtServer`.

### Compatibilidade legado
`parseZenOSDate()` continua interpretando datas históricas em múltiplos formatos.

---

## 11. Mesas

- **Criar mapa inicial:** OK estrutural
- **Editar/adicionar item:** transação Firestore implementada
- **Multiterminal:** realtime implementado; execução automatizada real pendente
- **Concorrência:** `runTransaction` + versionamento implementado; execução real pendente
- **Estoque:** NÃO integrado ao motor canônico completo
- **Caixa:** NÃO integrado ao motor canônico completo
- **Pagamento:** fechamento baseline simplificado; misto não seguro/completo
- **Cancelamento/reposição:** NÃO completo
- **Fiado:** NÃO completo
- **Voucher:** NÃO completo no fechamento
- **Cliente na Mesa:** NÃO completo

### Status final
# EXPERIMENTAL

O módulo **não deve ser liberado comercialmente** nesta ATT. A ATT 09 prefere bloquear a alegação de confiabilidade a reescrever o PDV dentro de Mesas e criar regressões.

Documento detalhado: `ZENOS_MESAS_AUDIT.md`.

---

## 12. Regressão

Executada no container após as alterações:

- ATT 01 — 21 verificações: **PASSOU**
- ATT 01.1 — 16/16: **PASSOU**
- ATT 02 — 10 grupos: **PASSOU**
- ATT 03 — 21: **PASSOU**
- ATT 04 — 24: **PASSOU**
- ATT 06 — 18: **PASSOU**
- ATT 06.1 — 18/18: **PASSOU**
- ATT 06.2 — 24/24: **PASSOU**
- ATT 07 — financeiro/caixa/fiado/voucher/não regressão: **PASSOU**
- ATT 07.1 — cadastro/margem/proteção de dados: **PASSOU**
- ATT 08 — 20/20: **PASSOU**
- ATT 08.1 — 24/24: **PASSOU**
- ATT 08.2 — 19/19: **PASSOU**
- ATT 08.3 — 10/10: **PASSOU**
- ATT 09 — 24/24: **PASSOU**

### Validação sintática adicional
48 arquivos JS/JSX foram transpilados sintaticamente com TypeScript: **0 erros**.

### Diálogos nativos
Busca final em `/src`:
- `alert`: 0
- `window.alert`: 0
- `confirm`: 0
- `window.confirm`: 0
- `prompt`: 0

---

## 13. Testes não executados

1. `npm run build` da **ATT 09** — não executável no container porque `npm ci` não consegue baixar dependências (rede indisponível). Baseline 08.3 foi construída no Windows do usuário e passou em 33,38 s.
2. `npm run test:att09:emulator` — não executável no container pelo mesmo motivo de dependências Firebase ausentes.
3. Teste visual manual completo da ATT 09 no navegador — pendente no Windows.
4. Nenhum teste foi executado contra produção — propositalmente.

Esses itens são gates obrigatórios antes de mudar o status deste pacote de RC para FINAL/APROVADO.

---

## 14. Riscos restantes

1. Arquitetura V1 ainda grava vários domínios como arrays; concorrência estrutural total só será eliminada na futura V2.
2. Mesas continua EXPERIMENTAL pelos motivos documentados.
3. Auditoria de estoque órfã de produtos removidos por versões antigas pode não ser enumerável pelo cliente web no backup.
4. Datas dentro de arrays V1 permanecem ISO/client-side por compatibilidade; documentos independentes e metadados do documento usam timestamp de servidor.
5. Operadores legados permanecem temporariamente com PIN plaintext até o próximo login, quando a troca é obrigatória. A ATT 09 não reescreve silenciosamente credenciais sem o usuário autenticar.

---

## 15. Arquivos críticos byte a byte preservados

Comparados contra o ZIP ATT 08.3:

- `src/components/Clientes.jsx`
- `src/components/Vendas.jsx`
- `src/components/PDVCompras.jsx`
- `src/components/Despesas.jsx`
- `src/components/Comissoes.jsx`
- `src/components/GestaoCaixas.jsx`
- `src/components/ZenModal.jsx`
- `src/core/inventory.js`
- `src/core/profitability.js`
- `src/core/productIdentity.js`
- `src/core/storeProfile.js`
- demais arquivos indicados como iguais em `docs/ATT09_DIFF_MANIFEST.json`.

Não houve arquivo removido.

---

## Gate para aprovação FINAL

Antes de chamar ATT 09 de FINAL, no Windows de homologação executar:

```powershell
npm.cmd run test:att09
npm.cmd run build
```

Depois, com as portas 8080/9099 livres:

```powershell
npm.cmd run test:att09:emulator
```

Se os três passarem, executar teste visual de Backup, Sync, troca de PIN e banner EXPERIMENTAL de Mesas. Somente então a ATT 09 pode ser congelada como baseline para a futura preparação V2.

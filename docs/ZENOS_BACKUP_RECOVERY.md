# ZenOS — Backup e Recuperação V1 (ATT 09)

## Princípio
O backup é **somente leitura da origem**, não altera produção e não executa migração. Restauração foi implementada exclusivamente para **homologação/emulador** e é bloqueada fora desse ambiente.

## Formato
Versão: `ZENOS_V1_BACKUP_1`

Metadados:
- `backupVersion`
- `zenosVersion`
- `schemaVersion`
- `lojaId`
- `createdAt`
- `createdBy`
- `checksum` SHA-256

## Entidades incluídas
- documento raiz da loja;
- `dados/operacao` completo (produtos, clientes, fornecedores, vendas, compras, despesas, movimentos e turnos de caixa, vouchers, operadores, regras etc.);
- `dados/configuracoes`;
- `dados/mesas`;
- `financeiro_livro`;
- `produto_indices`;
- auditoria de estoque dos produtos conhecidos pelo catálogo V1.

O arquivo também grava contagens independentes de produtos, clientes, fornecedores, vendas, compras, despesas, caixa, turnos, contas com saldo, vouchers, operadores, mesas/comandas, Livro Financeiro, auditoria de estoque e índices de produto.

## Integridade
O checksum é calculado sobre representação canônica do conteúdo, excluindo apenas o próprio campo de checksum. Na validação:
1. versão do backup é verificada;
2. loja de origem deve existir no metadata;
3. contagens são recalculadas;
4. checksum é recalculado;
5. qualquer divergência invalida o arquivo.

Um arquivo modificado após a exportação é rejeitado.

## Exportação
Em `Configurações > Backup e Recuperação V1`:
- **Exportar Backup Validado** lê a nuvem e gera JSON;
- o arquivo só é oferecido depois da validação do próprio checksum;
- a sessão registra que existe backup validado para liberar a antiga zona destrutiva de limpeza.

## Validação de arquivo
O usuário pode selecionar um JSON exportado. A validação não restaura nada; somente confere versão, contagens e checksum.

## Restauração
`Restaurar em Homologação Vazia` aparece somente em homologação.

Travas:
- `ZENOS_RUNTIME.isHomologacao` obrigatório;
- backup precisa ser válido;
- destino deve estar vazio para operação, Livro Financeiro e consumos ativos de Mesas;
- não há `deleteDoc`/`deleteField` no restaurador;
- produção não possui botão/caminho autorizado para restauração nesta ATT.

## Testes
### Em memória
A bateria ATT 09 simula:
- 970 produtos;
- 500 clientes;
- 5.000 vendas;
- backup;
- checksum;
- restauração lógica;
- comparação exata de IDs e conteúdo.

Também testa carga de estresse com 1.000 produtos, 500 clientes e 5.000 vendas.

### Firebase Emulator
Script preparado: `npm run test:att09:emulator`.

Ele:
1. cria loja artificial no Emulator;
2. gera backup com o coletor real;
3. valida checksum/contagens;
4. restaura em outra loja vazia do Emulator usando o restaurador real;
5. compara produtos/clientes/vendas e Livro Financeiro;
6. testa Mesas em dois clientes Firebase simultâneos.

Nunca usa projeto de produção.

## Limitação conhecida — auditoria de estoque órfã
O SDK cliente do Firestore não oferece enumeração genérica de subcoleções de todos os documentos. O backup percorre as chaves de auditoria derivadas dos **produtos presentes no catálogo V1** (incluindo chave nova ID+SKU e chave legada por ID).

Na operação normal aprovada, produtos com histórico comercial são inativados em vez de apagados, portanto permanecem no catálogo e sua trilha é incluída. Entretanto, se existir na base antiga uma subcoleção de auditoria órfã pertencente a um produto fisicamente removido antes dessas proteções, o cliente web não consegue descobri-la genericamente. Isso deve ser verificado por ferramenta administrativa/backend antes de considerar uma futura migração V2 definitiva.

A ATT 09 não esconde essa limitação nem tenta varrer dados de outras lojas.

## Produção
Nesta ATT:
- restauração em produção: **PROIBIDA**;
- migração: **NÃO**;
- V2: **NÃO**;
- alteração de IDs: **NÃO**.

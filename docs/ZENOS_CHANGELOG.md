# ZenOS — Changelog Técnico

## ATT 01 — Proteção e utilitários

- Data: 2026-10-05
- Objetivo: criar fundação não destrutiva para persistência V1 e impedir descarte silencioso de campos.
- Banco de produção acessado: NÃO.
- Migração executada: NÃO.
- Estrutura V2 criada: NÃO.

### Arquivos alterados
- `src/App.jsx`
- `src/data.js`
- `package.json`

### Arquivos criados
- `src/core/persistenceSafety.js`
- `docs/ZENOS_DATA_MAP_V1.md`
- `docs/ZENOS_CHANGELOG.md`
- `docs/ATT01_REPORT.md`
- `scripts/att01-static-check.mjs`

### Solução
1. Centralização das gravações automáticas V1 em uma função que preserva o caminho e usa `merge:true`.
2. Erros de cache/nuvem deixam de ser descartados silenciosamente e emitem estado técnico de persistência.
3. `zenos_schema_version` deixa de ser atualizado automaticamente sem migração real.
4. Normalizadores de produto/cliente preservam campos adicionais/legados.
5. Adicionado teste estático específico da ATT 01.

### Rollback
Reverter os arquivos acima restaura o comportamento anterior. Nenhum dado foi migrado ou transformado por esta ATT.

### Testes
- 21 verificações estáticas: OK.
- Normalizadores preservando campos legados: OK.
- Sintaxe dos novos JS: OK.
- Build Vite: NÃO CONCLUÍDO no ambiente (instalação de dependências incompleta).
- Produção/Firestore real: NÃO TESTADO.

## ATT 01.1 — Ambiente Seguro de Homologação
- Localhost forçado para homologação.
- Firebase de homologação usa `demo-zenos-local` + Auth/Firestore Emulator.
- Analytics desabilitado em homologação.
- localStorage isolado com namespace `zenos_hml__`.
- Cache legado genérico bloqueado em homologação.
- Banner global MODO TESTE adicionado.
- Nenhuma migração, exclusão ou alteração de dados de produção executada.

### Validação posterior — ATT 01 / ATT 01.1
- ATT 01 validada no Windows do projeto: `npm ci` OK, 21/21 testes OK, build Vite OK e inicialização localhost OK.
- ATT 01.1 validada no Windows: Auth Emulator 9099 OK, Firestore Emulator 8080 OK e banner de homologação confirmado visualmente.

## ATT 02 — Reconciliação de Estoque + Devoluções
- Data: 2026-10-05
- Banco de produção acessado: NÃO.
- Migração executada: NÃO.
- Estrutura V2 criada: NÃO.

### Arquivos alterados
- `src/components/PDV.jsx`
- `src/components/Vendas.jsx`
- `src/App.jsx`
- `src/components/DashboardMobile.jsx`
- `package.json`
- `docs/ZENOS_CHANGELOG.md`

### Arquivos criados
- `src/core/inventory.js`
- `src/core/salesFinancials.js`
- `scripts/att02-check.mjs`
- `docs/ATT02_REPORT.md`

### Solução
1. Estoque total, Vitrine e Galpão passam a ser atualizados juntos.
2. Baixa de venda registra origem do estoque por item.
3. Devolução usa `produtoOriginalId` e repõe a origem correta quando conhecida.
4. Compatibilidade para vendas/produtos legados sem migração destrutiva.
5. Estorno passa a respeitar desconto global da venda.
6. Venda original mantém valores brutos; campos líquidos são adicionados para devoluções.
7. Dashboards passam a considerar valores líquidos de vendas parciais.

### Testes
- ATT 01: 21/21 OK.
- ATT 01.1: 16/16 OK.
- ATT 02: 10 grupos de verificações funcionais/estáticas OK.
- Build Vite no ambiente do assistente: pendente por timeout de instalação de dependências.

### Rollback
Reverter os arquivos da ATT 02 restaura o comportamento anterior. Nenhum dado foi migrado em lote e nenhum documento de produção foi apagado.

## ATT 03 — Datas, Vendido Hoje e Comissões

- **Objetivo:** corrigir leitura temporal e cálculos mensais/diários sem migrar registros históricos.
- **Arquivos alterados:** `src/App.jsx`, `src/components/Comissoes.jsx`, `src/components/PDV.jsx`, `src/components/Mesas.jsx`, `package.json`, `docs/ZENOS_CHANGELOG.md`.
- **Arquivos criados:** `src/core/dates.js`, `src/core/commissions.js`, `scripts/att03-check.mjs`, `docs/ATT03_REPORT.md`.
- **Problema:** `Vendido Hoje` exibia faturamento histórico total; comissão filtrava `dataHora` no formato `DD/MM/YYYY...` usando `startsWith('YYYY-MM')`; novas vendas não possuíam data estruturada; comissões ignoravam devoluções parciais na base de faturamento/lucro.
- **Solução:** parser compatível com datas V1; filtro local por dia/mês; `createdAt` ISO apenas para novos registros; comissão baseada em faturamento/lucro líquidos após devoluções.
- **Impacto em dados existentes:** nenhum registro histórico é reescrito, migrado ou excluído.
- **Rollback:** remover os arquivos utilitários novos e restaurar os arquivos alterados pela versão ATT 02.
- **Testes:** ATT01 21/21; ATT01.1 16/16; ATT02 10 grupos; ATT03 21/21. Build deve ser confirmado no ambiente Windows de homologação porque o container não concluiu a instalação do Vite.

## ATT 04 — Operação, Compras, Comissões e Semáforo por Margem

- **Objetivo:** corrigir falhas encontradas na homologação sem alterar V1 histórica, sem migrar dados e sem iniciar V2.
- **Banco de produção acessado:** NÃO.
- **Migração executada:** NÃO.
- **Estrutura V2 criada:** NÃO.

### Correções
1. Produto criado pelo botão `+ Produto Balcão` nasce como produto normal de estoque; só é encomenda/uso único quando o checkbox é marcado.
2. Registros legados com SKU `ENCOMENDA-*` continuam reconhecidos como encomenda para que estornos antigos não tentem repor um produto já removido do catálogo.
3. Compra de mercadoria aumenta depósito/galpão mantendo `estoque = vitrine + galpão`.
4. Compra à vista aparece em Contas a Pagar como paga, mas marcada `estoque_ativo / afetaResultado:false` para não reduzir o lucro duas vezes.
5. Compra em dinheiro com turno aberto gera `saida_compra` e reduz a gaveta física; Pix não reduz a gaveta.
6. Lucro líquido e painel CEO excluem compras de estoque das despesas operacionais, pois o custo é reconhecido no resultado via CMV da venda.
7. Comissões permitem mês anterior/seguinte e período personalizado.
8. PDV, Comissões e Dashboard CEO passam a usar a mesma classificação de margem: verde >= ideal; amarelo >= mínima e < ideal; vermelho < mínima.
9. Comissões exibem margem média real por operador e quantidade de vendas em cada faixa.

### Testes
- ATT 01: 21/21 OK.
- ATT 01.1: 16/16 OK.
- ATT 02: 10 grupos OK.
- ATT 03: 21/21 OK.
- ATT 04: 24/24 OK.
- Build Vite no ambiente do assistente: pendente porque `npm ci` excedeu o limite do container; deve ser validado no Windows de homologação.

### Rollback
Reverter os arquivos da ATT 04 retorna ao comportamento da ATT 03. Nenhum cadastro existente é convertido, apagado ou regravado em lote por esta atualização.

## ATT 06 — Movimentação de Estoque Auditável
- Data: 2026-10-06
- Status: código concluído; regressão ATT01–ATT04 + ATT06 aprovada; build Windows pendente.
- Problema: Vitrine possuía ajuste rápido sem trilha; Depósito não tinha controles equivalentes; estoque não possuía histórico operacional por produto.
- Solução: transferências auditadas Vitrine↔Depósito, histórico por produto em coleção separada, registro de venda/compra/devolução, aviso de estoque somente na vitrine e janela consultável por plano.
- Banco real: não acessado.
- Exclusões: nenhuma.
- Rollback: remover os arquivos/integrações da ATT06 e retornar ao pacote ATT04; nenhum dado antigo foi migrado.

## ATT 06.1 — Blindagem de Identidade + Estoque por Origem
- Data: 2026-10-06
- Status: código e regressão lógica concluídos; build Windows pendente.
- Causa raiz: geração de IDs com `Date.now()` permitia colisão entre produtos/clientes criados no mesmo instante; operações por ID podiam alterar múltiplos registros e misturar histórico.
- Correções: identidade robusta, ID + SKU em operações críticas, bloqueio de ambiguidade, histórico segregado, produto rápido entrando no Depósito, aviso completo Vitrine/Depósito, preflight de compras, conta nova sem dados de demonstração.
- Banco real: não acessado.
- Exclusões/migração: nenhuma.
- Testes: ATT01 21/21; ATT01.1 16/16; ATT02 10 grupos; ATT03 21/21; ATT04 24/24; ATT06 18/18; ATT06.1 18/18.
- Rollback: retornar ao pacote ATT06. Nenhum reparo de dados reais foi executado automaticamente.


## ATT 06.2 — Multiusuário + Voucher + Impressão
Realtime V1, trava atômica de duplicidade, inativação segura, modal ZenOS, identidade rápida e impressão configurável. Produção não acessada.

## ATT 07 — Livro Financeiro + Caixa + Fiado + Voucher Impresso
- Data: 2026-10-06
- Baseline: ATT 06.2 CORRIGIDA enviada e aprovada pelo usuário; ATT 07 anterior descartada.
- Princípio: implementação aditiva, sem migração/reconstrução de registros históricos.
- Novo: subcoleção independente `financeiro_livro`, extrato auditável de fiado para novos eventos, painel gerencial de caixas abertos, separação dinheiro/Pix/cartão/voucher/fiado, tratamento financeiro de devoluções, pagamentos de compras/despesas e voucher impresso com auditoria de via/operador.
- Não regressão: hashes dos módulos protegidos da baseline preservados; nenhum arquivo tocado aumentou alert/confirm/prompt nativos.
- Testes: ATT01, ATT01.1, ATT02, ATT03, ATT04, ATT06, ATT06.1, ATT06.2 e ATT07 passaram na regressão estática/lógica.
- Build Vite: não certificado no container por timeout de `npm ci`; validar no Windows de homologação.
- Teste dois terminais: script criado, não executado no container por dependências Firebase incompletas; validar via `npm.cmd run test:att07:emulator`.
- Banco real: não acessado. Migração: não executada. Exclusões: nenhuma.

## ATT 07.1 — Correção crítica de cadastro, margem, modais e proteção de dados
- Data: 2026-10-06
- Base: ATT 07 cirúrgica sobre ATT 06.2 corrigida aprovada.
- Corrigido erro Firestore `all reads before all writes` na trava de identidade de produtos.
- Criado motor seguro de preço/margem; 100% bloqueado e `Infinity` eliminado.
- Produtos, Clientes e PDV usam ZenModal nos fluxos críticos corrigidos, sem pop-ups nativos nesses componentes.
- Adicionada proteção fail-closed no bootstrap: falha de leitura da nuvem nunca libera persistência de arrays vazios.
- PIX e cartões passam a aparecer por turno sem compor dinheiro físico da gaveta.
- Simulação automatizada com 970 produtos preservou quantidade, IDs e unicidade.
- Regressão ATT01 -> ATT071 aprovada.
- Build Vite no container: não certificado por instalação incompleta do Vite; validar no Windows.
- Produção: não acessada. Migração: nenhuma. Exclusão: nenhuma.

## ATT 08 — Motor de Comissões, Metas e Bonificações
- Data: 2026-10-06
- Base: ATT 07.1 aprovada em homologação.
- Comissão pode ser configurada sobre lucro líquido ou faturamento líquido.
- Semáforo de margem permanece obrigatório e independente da base escolhida.
- Venda com lucro zero/prejuízo paga comissão zero; comissão percentual também é limitada ao lucro positivo da própria venda.
- Adicionado motor de múltiplas bonificações automáticas por faturamento, lucro, vendas, ticket médio, margem média, vendas verdes e ausência de devoluções.
- Regras de comissão passam a sincronizar entre terminais pelo campo V1 `regrasComissao`, mantendo leitura do formato local legado.
- Nenhuma venda, produto, cliente, estoque, caixa ou voucher foi migrado/regravado.
- Testes: regressão ATT01 → ATT07.1 aprovada; ATT08 20/20.
- Build Vite no container: não certificado por instalação incompleta das dependências; validar no Windows de homologação.
- Produção: não acessada. Migração: nenhuma. Exclusão: nenhuma.

## ATT 08.1 — Correção e Auditoria de Não Regressão
- Data: 2026-10-06
- Base: ATT 08 em homologação; nenhuma fonte externa/ATT paralela usada.
- Objetivo: corrigir vazamento de perfil entre contas, equivalentes monetários no recibo, origem física do reembolso, consistência do cadastro rápido de estoque, regressão do semáforo e alinhamento do formulário de margem.
- Isolamento por conta: perfil/logo, comissão local e mesas passam a usar UID; cache genérico de perfil e fallback genérico de operação não são mais lidos; troca/logout zera perfil, câmbio e regras em RAM.
- Câmbio: cotações passam a ser persistidas em `lojas/{uid}/dados/configuracoes`, sincronizadas por loja e congeladas como snapshot em novas vendas para reimpressão histórica consistente.
- Recibo: total equivalente exibido em BRL/USD/PYG/EUR quando houver cotação; troco passa a respeitar a moeda escolhida.
- Devolução em dinheiro: gerência autoriza, mas pode selecionar qualquer turno de caixa aberto com saldo suficiente como origem física; sem saldo, orientar Pix/Banco ou Voucher.
- Cadastro rápido PDV: Vitrine e Depósito informados separadamente, edição preserva distribuição física, saldo inicial novo gera auditoria.
- Semáforo: regra 0/0 é tratada como configuração inválida/vazia e retorna ao padrão seguro 30%/15%.
- Produto: bloco Custo/Margem/Preço/Vitrine/Depósito realinhado sem mudar regras de negócio.
- Produção: não acessada. Migração: nenhuma. Exclusão: nenhuma. V2: não ativada.
- Testes: regressão ATT01→ATT08 aprovada; ATT08.1 24/24; sintaxe JSX validada nos arquivos alterados. Build Vite deve ser confirmado no Windows de homologação porque o container não concluiu `npm ci`.

## ATT 08.2 — Correção de PIN gerencial, browser, modais e caixa
- Data: 2026-10-06
- Base: ATT 08.1 aprovada em homologação.
- Corrigida divergência entre PIN do administrador (`admin`) e senha legada de margem (`1234`): aprovações agora usam PIN de operador Gerência/Admin.
- Adicionada troca de PIN por operador em Configurações; administrador principal é protegido contra remoção/rebaixamento.
- PINs internos deixam de ser campos password do navegador, reduzindo prompts indevidos do gerenciador de senhas.
- Removidos alert/confirm/prompt nativos restantes do código `src`; interações usam UI ZenOS.
- Corrigido caixa negativo em devolução total: entrada original da venda paga permanece no fluxo histórico e a devolução é saída independente; R$60 vendido + R$60 devolvido = R$0.
- Devolução revalida saldo imediatamente antes do registro e sangria acima do saldo é bloqueada.
- Regressão ATT01→ATT08.1 aprovada; ATT08.2 19/19.
- Produção não acessada. Migração: nenhuma. Exclusões: nenhuma. Build Vite a validar no Windows.

## ATT 09 — Blindagem Final da V1 antes da V2
- Data: 2026-10-07
- Baseline: ATT 08.3 aprovada; SHA-256 `101dd7730c041a7b3294b9c2aa49880c498619d7ac8ee5fe5dc290aabcb60e25`.
- Baseline: regressão completa aprovada e build Windows aprovado em 33,38 s antes de qualquer alteração.
- Backup V1: exportação/validação com SHA-256, contagens e restauração bloqueada fora da homologação; teste real de Emulator preparado.
- Storage: auditoria final; chamadas diretas centralizadas em `core/storage.js`; dados de loja permanecem UID-específicos e homologação possui namespace próprio.
- Sincronização: estados SALVANDO/SINCRONIZADO/PENDENTE/OFFLINE/ERRO com agregação por domínio; sucesso de um domínio não esconde erro pendente de outro.
- Proteção cloud-first preservada: falha de leitura não libera escrita de arrays vazios.
- PIN: credenciais novas usam PBKDF2-HMAC-SHA256 com salt; credenciais legadas exigem troca no próximo acesso; padrões triviais bloqueados; sem backdoor novo.
- Timestamps: documentos/metadados críticos alterados recebem `serverTimestamp()`; datas históricas dentro dos arrays V1 não são reescritas.
- Mesas/Comandas: persistência cloud + realtime + transações adicionadas; cache legado UID-específico é apenas importável; módulo permanece explicitamente EXPERIMENTAL porque estoque/financeiro/fiado/misto/voucher ainda não usam integralmente o motor canônico do PDV.
- Regressão container: ATT01 → ATT09 aprovada; ATT09 24/24; 48 arquivos JS/JSX com 0 erros sintáticos; zero `alert/confirm/prompt` em `/src`.
- Produção: NÃO acessada. Migração: NÃO. V2: NÃO criada. Exclusões: nenhuma.
- Status da entrega: RC enquanto build ATT09 e `test:att09:emulator` não forem confirmados no Windows de homologação.

## ATT 10.1 RC1 — Redesign visual com paridade funcional 1:1
- Novo dashboard/sidebars/temas como camada visual.
- Nenhuma função do menu aprovado removida.
- Core de PDV, estoque, clientes, vendas, caixa, configuração e financeiro preservado byte a byte.
- Navegação do PDV uniformizada com a regra aprovada: acesso permitido sem turno para geração de Pré-Pedido.
- Status RC1 até build e testes manuais no Windows.

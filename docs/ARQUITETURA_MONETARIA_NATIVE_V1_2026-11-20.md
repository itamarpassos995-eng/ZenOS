# ZenOS — arquitetura monetária nativa, homologação (20/11/2026)

**Base estável:** commit de produção 662419a (19/11). **Esta branch não está publicada nem conectada ao Firebase.**

Regra: moeda padrão = moeda nominal da loja. Documento, preço, dívida, saldo e lucro finalizados NÃO variam com a cotação atual. Registrar sempre moeda e quantia contratuais, pagamento físico, cotação confirmada na operação e equivalente contábil histórico. Só converter quando moedas diferem ou para snapshot de compatibilidade BRL congelado no evento. Nunca converter saldo legado na taxa atual para inventar PYG.

### Pontos do código auditados
- App.jsx: fmt e conversões genéricas usam cotação atual e fallback taxasCambio[codigo] || 1.
- PDV.jsx: crediário atualmente fixa moedaOrigem BRL; dívida cliente acumula saldoDevedorBRL. Venda possui moedaDocumento e totalOriginal, mas não basta para corrigir todo fiado legado.
- Clientes.jsx: amortização do saldo é predominantemente BRL contábil.
- Despesas.jsx: edição recalcula valorBRL com cotação atual.
- Vendas.jsx: devolução escreve saída física em BRL sem comprovar moeda entregue.
- cashReconciliation.js já reconstrói caixa por moeda; reutilizar sem segundo motor.
- productMoney.js tem metadados valoresMonetarios; preservar.
- Dados antigos VIPE: precisam auditoria read-only por cliente e origem; não reclassificar 13 dívidas.

### Fundação implementada
Funções puras de documento nominal, quitação em moeda idêntica ou diferente, amortização parcial, saldo contratual, câmbio em racionais/BigInt e totalização por moeda sem soma indevida. IDs duplicados/valor excedente rejeitados. PYG não aceita frações. Pagamentos são imutáveis, snapshot BRL não muda o preço. Exemplo Gs. 25000 na taxa 1150, mudada para 1100, continua Gs. 25000; pagamento em BRL R$ 22,73 gera diferença contábil separada de R$ 0,99.

### Etapas ainda bloqueadas até homologação
1. Auditar somente leitura vendas a prazo, pagamentos, saldos importados, devoluções e livros dos 13 clientes VIPE; classificar comprovados, recuperáveis e sem origem.
2. Integrar nas operações NOVAS do PDV, Clientes, Despesas e Devoluções em um único commit transacional idempotente com guarda de saldo físico por moeda.
3. Preservar estoque, CMV, lucro, cheque, crédito, cartão, troco, Mesas e Commerce; não criar painéis/listeners extras.
4. Testar UI real PT/ES, Emulator, 2 terminais, offline, câmbio mudando, fiado parcial, compras, despesas, estorno, fechamento e lucro, sem duplicar escrituração.
5. Reconciliar branch com a main antes de qualquer merge, e publicar uma única versão consolidada depois da homologação.

**Situação:** testes locais da fundação passaram. Não há alteração em saldos, caixa, banco, relatórios ou produção. Não declarar o ZenOS integralmente corrigido nesta etapa.
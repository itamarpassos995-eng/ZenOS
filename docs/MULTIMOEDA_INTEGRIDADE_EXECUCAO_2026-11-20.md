# Integridade monetária — implementação em homologação (20/11/2026)

Base: main após PR #218, commit 277f871. Branch: feat/multicurrency-financial-integrity-20261120. PR draft #219.

## Alterações executadas no código
- Motor puro nativeMoneyEvents: valida moeda, quantia, taxa e equivalente BRL sem fallback ou taxas arbitrárias.
- Devolução em dinheiro: operador precisa identificar moeda e quantia físicas; histórico e movimento do caixa preservam ambos, taxas e registro do valor contábil; guard cash_native_balance_at_least executado no servidor em operação atômica.
- Despesas novas: passam a armazenar moeda e valor nativos e taxa aplicada, além do valorBRL; edição exclusivamente administrativa não altera snapshots antigos.
- Pagamento de despesa: moeda e valor realmente pagos explícitos; validação da obrigação na moeda original; guarda de saldo físico nativo no servidor; registra variação cambial/rounding residual em metadados, não os lança automaticamente no lucro.
- Histórico e interface: saída física na moeda comprovada; ausência de origem não inventa PYG, continua BRL contábil identificado.
- Testes nativos de BRL/PYG/USD/EUR, diferença de centavo, caixa físico, cotações inválidas, reembolso e despesas.

## Questões abertas que impedem publicação
- Homologação real de caixa e escrituração multimoeda para devoluções e despesas; teste com contas reais não executado.
- Diferenças cambiais e arredondamento estão registrados, mas sua conciliação com o lucro e livro financeiro exige contrato contábil e prova.
- Despesas legadas sem origem não podem sofrer alteração monetária automática; auditoria somente leitura da VIPE ainda não executada.
- Parcelamento de despesas e estornos transmoeda parciais precisam de prova específica.
- Fiado, Mesas, pedidos online, relatórios, sincronização da VIPE e importados antigos permanecem pendentes para a conclusão integral do prompt master.
- Sem acesso autorizado a sessão real da VIPE, status 'Erro ao sincronizar' não pode ser fechado com evidência apenas por inspeção de código.

## Medidas de segurança
Nenhuma gravação em Firestore de produção ou migração de dados feita. Branch e PR mantidas como draft; deploy de produção não solicitado. Nenhum equivalente BRL foi reclassificado como PYG retroativamente.

## Continuidade de conciliação (PR #219)
- Depesas com moeda original comprovada são quitadas pelo valor contratual, não reprecificadas pelo câmbio de pagamento.
- Para despesas operacionais, diferença cambial realizada gera lançamento idempotente separado no livro, sem saída física; resultado líquido usa o valor histórico acrescido da diferença realizada, sem duplicação com o caixa.
- Devoluções nativas usam totalOriginal/moedaDocumento da venda e rateio proporcional acumulado em devoluções parciais. Divergência de câmbio gera lançamento financeiro separado, sem nova movimentação física.
- Caixa multimoeda valida saldo real da moeda entregue. Verificação adicional em BRL é aplicada somente quando a moeda física é BRL.
- Servidor revalida cotação contra a configuração atual com money_exchange_rates_match antes de confirmar entrada/saída. Falha na verificação bloqueia, sem gravar.
- Recebimento de fiado: moeda e valor físicos explícitos; snapshot de cotação e guarda no servidor. O saldo legado continua rotulado BRL contábil, porque não há reconstrução comprovada da moeda contratual por cliente.
- A segunda via/histórico da venda preservam moedas nativas quando provadas; preview de devolução informa o valor contratual sem taxa atual.
- Lançamentos sem informação de origem permanecem sem reclassificação e não foram migrados.

## Bloqueios ainda abertos, sem alegação de homologação
1. Fiado contratual nativo por parcela/venda: permanece modelado majoritariamente em saldo BRL histórico. Exige conciliação por dívida, recepção e estorno antes de conversão do saldo principal para PYG.
2. Mesas continuam em módulo experimental com documentos que não comprovam moedas originais nem a contabilização completa de estoque/financeiro. Não reescrever vendas passadas.
3. Pagamentos parciais de despesa, estoque ativo com diferença cambial, troco multimoeda e fiscalidade demandam fluxos próprios e homologação.
4. Erro de sincronização VIPE: sem log remoto desta sessão, não há comprovação da causa; não limpar cache ou regravar dados reais.
5. Teste com dados reais da VIPE e validação no terminal do cliente ainda não ocorreram; CI não equivale a esse teste.
6. Preservar PR como draft, sem merge ou deploy de produção enquanto houver esses bloqueios.

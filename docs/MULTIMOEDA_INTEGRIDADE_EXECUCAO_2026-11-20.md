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

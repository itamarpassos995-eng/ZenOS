# Valores nativos de produtos

Preços e custos novos guardam `valoresMonetarios.versao = 1` e uma quantia independente por campo em `campos`. Cada quantia tem `valor`, `moeda`, `equivalenteRegistroBRL` e `taxaRegistro`. BRL, PYG, USD e EUR são moedas de origem equivalentes. Custo e preço podem usar moedas diferentes.

A moeda predeterminada inicializa cadastros novos. Mudar a preferência não reclassifica cadastros existentes. Mudar cotações altera somente equivalentes para consulta e operações novas; não altera a quantia original nem os documentos já registrados. Alterar explicitamente a moeda no formulário converte também o número com a cotação atual.

Os campos antigos terminados em BRL são snapshots de compatibilidade com os contratos existentes, e não a fonte do preço nativo. Consultas usam `valorProdutoBRL`/`projetarProdutoMonetario` sem persistir as projeções. Sem metadados de origem, o registro permanece legado; nenhuma moeda é inferida pela preferência atual. Editar outros dados sem mudar os valores preserva sua precisão e classificação.

PDV, compras e mesas congelam os valores da operação. Vendas e compras guardam moeda do documento, total original e cotações. CMV e devoluções continuam usando snapshots históricos; atualizar o catálogo não reavalia vendas antigas. O custo médio novo recebe a moeda escolhida na operação. Mudanças monetárias conflitantes em dois terminais são recusadas para recarregar e conferir; valor nativo e equivalente nunca são mesclados separadamente.

A vitrine publica somente a origem do preço, sem custos. Seus cálculos usam unidades mínimas da moeda da loja (1 para PYG, 100 para BRL/USD/EUR), preservando o preço PYG sem perda por centavos intermediários. Pedidos privados guardam a moeda, o total nativo e os equivalentes congelados. Idempotência e validação de preços no servidor permanecem obrigatórias.

Não é necessário migrar lojas nem fazer leituras adicionais. Os valores antigos sem origem comprovada não são convertidos ou corrigidos automaticamente. O Livro Financeiro legado mantém seus contratos contábeis; estes metadados não constituem uma reclassificação retroativa de saldos, dívidas ou lançamentos antigos.

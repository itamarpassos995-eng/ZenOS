# ORDEM DE IMPLEMENTAÇÃO — ARQUITETURA MULTIMOEDA INTEGRAL DO ZENOS
## Branch isolada, homologação e preservação dos dados existentes

Atue como engenheiro de software sênior responsável pela evolução segura do ZenOS, com domínio de React, JavaScript, Firebase, Firestore, Vercel, precisão monetária, conciliação financeira, sistemas multitenant e compatibilidade de dados.

Execute a implementação descrita abaixo no projeto existente. Não entregue apenas sugestões ou outra arquitetura teórica. Investigue o código atual, implemente, teste e disponibilize uma versão isolada para minha validação.

## 1. Projeto, branch e limites de autorização

- Repositório: `itamarpassos995-eng/ZenOS`.
- Sistema oficial: `https://zenos.app.br`.
- Hospedagem do aplicativo principal: Vercel.
- Crie uma branch a partir da versão atualizada de `main`: `feat/multimoeda-integral-homologacao`.
- Antes de criar, verifique se essa branch já existe. Se existir, inspecione o trabalho e continue sem sobrescrever alterações.
- Leia as instruções do repositório e registre o commit de origem.
- Preserve mudanças de outras pessoas e trabalhos paralelos.
- Faça commits claros e abra um PR em rascunho para revisão.
- NÃO faça merge.
- NÃO publique em produção.
- NÃO promova deployment para o domínio oficial.
- NÃO altere configurações, regras, índices, dados ou infraestrutura de produção.
- NÃO execute migração ou correção de cadastros reais nesta etapa.
- NÃO altere o ZenOS Control Center nem crie outro painel.
- Preserve layout, navegação, identidade visual, permissões e funcionalidades existentes.
- Use ambiente isolado de homologação ou emulador `demo-zenos-local`, com dados sintéticos representativos.
- Branch separada não significa banco separado: comprove o isolamento dos serviços antes de executar testes que gravam dados.
- Se houver preview na Vercel, confirme que suas variáveis e serviços apontam para homologação. Não publique um preview gravável conectado à produção.
- Não substitua dados reais por dados de demonstração em nenhum ambiente de cliente.

A entrega desta etapa é uma implementação revisável e testável em ambiente isolado. A atualização oficial dependerá de minha validação posterior.

## 2. Problema confirmado e evidências iniciais

Uma atualização anterior persistiu a moeda predeterminada, mas o cadastro de produtos continuou tratando valores digitados como BRL.

Na auditoria anterior:

- `src/components/Produtos.jsx` gravava custo, venda e preços adicionais diretamente em campos como `custoBRL`, `precoBRL`, `preco2BRL` e `preco3BRL`.
- A edição carregava esses campos sem considerar a moeda de entrada.
- O formulário ainda mostrava “Custo (R$)”.
- `src/App.jsx` possuía uma função `fmt` que também convertia valores partindo de BRL.
- O componente de produtos não recebia todos os elementos necessários para distinguir moeda de cadastro e moeda de exibição.
- Um produto informado como `39990`, pretendido em PYG, apareceu como Gs. 9.197.700.
- A conta `39990 × 230 = 9197700` coincide exatamente com o print.
- Isso demonstra a compatibilidade do sintoma com interpretação indevida como BRL e aplicação posterior de câmbio. A cotação e os dados da conta não foram consultados diretamente.
- Os testes da atualização anterior verificavam persistência da preferência e outras condições estáticas, mas não cobriam o fluxo completo de cadastrar em PYG, salvar, reabrir, editar e vender.

Revalide essas evidências no código atual. Referências de linhas podem ter mudado. Não trate a auditoria anterior como substituta da leitura atual do repositório.

## 3. Regra central obrigatória

CADA VALOR MONETÁRIO PERTENCE A UMA MOEDA EXPLÍCITA, E ESSA MOEDA ACOMPANHA O DADO DURANTE TODA A SUA EXISTÊNCIA.

A preferência atual da empresa ou do cabeçalho nunca pode reinterpretar valores já registrados.

Exemplo obrigatório:

1. Empresa com moeda predeterminada PYG.
2. Novo produto com preço digitado de Gs. 39.990.
3. Salvar deve preservar o preço original de Gs. 39.990.
4. Reabrir ou editar deve continuar mostrando esse valor e sua moeda.
5. Visualizar em BRL deve apresentar uma equivalência pelo câmbio configurado.
6. Voltar para PYG deve mostrar novamente Gs. 39.990.
7. Nenhuma dessas consultas deve regravar o preço original.
8. Mudar o câmbio não pode reajustar o preço original em PYG.
9. Mudar a moeda predeterminada para BRL não pode reinterpretar o cadastro antigo como R$ 39.990.

## 4. Separação obrigatória dos conceitos de moeda

Implemente conceitos distintos:

### 4.1 Moeda predeterminada da empresa

- Preenche a moeda de novos cadastros e novas operações.
- Não altera retroativamente registros existentes.
- Deve respeitar permissões e isolamento por empresa.
- A mudança deve ter auditoria.
- Não deve modificar silenciosamente formulários ou operações já em andamento.

### 4.2 Moeda original do valor

- Identifica a moeda em que o preço, custo, obrigação ou operação foi registrado.
- Permanece vinculada ao registro.
- Não depende do seletor atual do cabeçalho.

### 4.3 Moeda de exibição

- Serve para consultas de equivalência.
- Alterar a visualização não persiste conversões nos valores originais.
- Deve distinguir claramente valor original de equivalente.

### 4.4 Moeda do pagamento

- Identifica o dinheiro ou recebível efetivamente movimentado.
- Pode diferir da moeda comercial da operação.
- Deve acompanhar cada parcela, recebimento, pagamento, troco, conta e maquininha.

### 4.5 Moeda fiscal

- Segue a configuração e as regras do documento fiscal.
- É separada da moeda de exibição e da preferência comercial.
- Preserve a escolha existente de país de emissão.
- Não deduza automaticamente a moeda original de registros antigos pelo país, idioma ou método de pagamento.

### 4.6 Alteração da moeda de precificação

Alterar a moeda original de um preço exige uma operação própria, distinta da mudança de preferência:

- Valor e moeda anteriores.
- Valor e moeda novos.
- Cotação utilizada, quando aplicável.
- Data, operador, motivo e revisão.
- Confirmação explícita da alteração comercial.
- Preservação do histórico.

## 5. Núcleo monetário único

Crie ou consolide um núcleo compartilhado por todos os módulos para:

- Interpretar entradas.
- Validar valores e moedas.
- Calcular.
- Arredondar.
- Converter.
- Formatar.
- Consolidar valores.
- Registrar snapshots de conversão.

Aproveite os módulos existentes quando forem adequados. Evite motores monetários concorrentes.

### 5.1 Contrato dos valores novos

Cada valor monetário novo deve possuir:

- Quantia.
- Moeda explícita.
- Precisão definida.
- Versão de esquema.
- Origem ou referência rastreável.

Quando houver conversão, registre:

- Quantia e moeda de origem.
- Quantia e moeda de destino.
- Cotação e sua direção.
- Data da cotação e momento de aplicação.
- Identificação ou versão da tabela de câmbio.
- Regra de arredondamento.
- Finalidade da conversão.

Defina um contrato concreto adequado ao Firestore e documente sua representação persistida.

### 5.2 Precisão

- Use cálculo decimal exato ou representação inteira com escala explícita.
- Não use aritmética binária de ponto flutuante como base dos cálculos monetários críticos.
- Caso use representação inteira, proteja limites de segurança e a serialização.
- Preserve precisão suficiente para custo unitário, rateios, taxas e quantidades fracionadas.
- Defina os pontos de arredondamento por operação.
- Diferencie precisão de cálculo de precisão de apresentação.
- Considere PYG sem casas decimais na apresentação monetária usual e BRL/USD/EUR com duas, preservando precisão interna quando necessária.
- Registre eventuais resíduos de arredondamento sem criar diferenças ocultas.

### 5.3 Formatar e converter são operações diferentes

- A função de formatação apenas apresenta a quantia na moeda informada.
- A conversão exige origem, destino e cotação explícitas.
- Nenhuma formatação deve aplicar câmbio implicitamente.
- Impeça conversão duplicada.
- Substitua gradualmente usos ambíguos de funções como `fmt`, sem alterar seus contratos globais de uma vez e quebrar consumidores antigos.

### 5.4 Validações

- Somar diretamente apenas valores da mesma moeda.
- Consolidar moedas distintas somente com conversão explícita.
- Nunca assumir cotação `1` quando ela estiver ausente ou inválida.
- Na mesma moeda, manter identidade sem depender de cotação externa.
- Rejeitar moedas desconhecidas, valores inválidos e conversões sem informação suficiente.
- Não transformar entrada inválida silenciosamente em zero.
- Interpretar separadores conforme o idioma e a moeda.
- Testar explicitamente `39990`, `39.990`, `39.990,00`, `39,990.00` e formatos ambíguos.
- Quando não houver interpretação segura, apresentar validação clara, sem adivinhar.
- Nunca truncar `39.990` para `39` por uso inadequado de `parseFloat`.
- Não usar números negativos, zero ou limites de maneira uniforme onde a regra de negócio exige tratamento diferente.

## 6. Produtos, serviços, custos e tabelas de preço

- Cada custo e preço deve carregar sua moeda.
- Custo e preço de venda podem ter moedas diferentes.
- Deve ser possível comprar em USD e vender em PYG sem perder a origem dos valores.
- No novo cadastro comum, custo, venda e tabelas adicionais começam na moeda predeterminada.
- A moeda deve estar visível junto aos campos.
- Usar outra moeda exige escolha explícita.
- Edição deve respeitar a moeda do valor existente.
- Mudança da preferência da empresa não deve reinterpretar o formulário.
- Preço comercial permanece fixo na moeda em que foi definido.
- Câmbio altera equivalências, não o preço original.
- Preserve preço de atacado, tabelas, escalas, promoções e preços especiais existentes.
- Preserve IDs, SKUs, estoque, grupos, fotos, permissões, flags de estoque negativo e demais dados.

### 6.1 Custo de aquisição e CMV

- Separe custo original de aquisição da referência gerencial usada na valorização.
- Registre a moeda original da compra.
- Registre base, método e cotação utilizados para o custo gerencial.
- Preserve o método de estoque existente, corrigindo sua integração monetária sem mudar silenciosamente a política de custeio.
- Venda concluída mantém o CMV apurado naquele momento.
- Mudança posterior de custo ou câmbio não recalcula vendas antigas.

## 7. Cobertura integral dos fluxos

Faça um inventário verificável de todos os campos monetários, leitores, gravadores, cálculos, interfaces, importações, exportações e integrações.

Não limite a correção ao formulário de produtos.

### 7.1 Produtos e serviços

Custo, preço de venda, atacado, tabelas adicionais, promoções, preços especiais e alterações de preço.

### 7.2 Compras e estoque

Custo de aquisição, frete, descontos, acréscimos, impostos já existentes, rateios, devoluções de compra, valorização, entradas e ajustes com impacto monetário.

### 7.3 PDV e vendas

Moeda comercial, preço praticado por item, quantidades, descontos, acréscimos, totais, pagamentos, troco, CMV e resultado.

Ao concluir, preserve os valores efetivamente utilizados.

### 7.4 Orçamentos e pré-pedidos

- Moeda e política de validade do câmbio registradas.
- Diferencie valor fixado de mera estimativa.
- Caso a cotação precise ser atualizada antes de concluir, a atualização deve ser explícita e rastreável.
- Não altere silenciosamente pedidos já aceitos.

### 7.5 Pagamentos e troco

- Cada parcela na moeda efetivamente recebida.
- Troco na moeda efetivamente entregue.
- Pagamentos mistos preservam as parcelas nativas.
- Equivalências devem utilizar a cotação registrada na operação.
- Saldo e quitação devem respeitar a moeda da dívida ou venda.

### 7.6 Cartões, Pix e bancos

- Separe método de pagamento, moeda, conta de destino e maquininha.
- Permita cartões em PYG, BRL e demais moedas suportadas conforme configuração.
- Considere clientes com maquininhas de países diferentes.
- Registre taxas, recebíveis e liquidação na moeda correspondente.
- Recebíveis eletrônicos não aumentam o dinheiro físico da gaveta.
- Preserve os fluxos existentes que já funcionam.

### 7.7 Caixa

Abertura, suprimento, sangria, recebimentos, saídas, devoluções, troco, saldo esperado, contagem e diferença separados por moeda.

- Não some diretamente BRL e PYG.
- Saldo físico é diferente de equivalente consolidado.
- Retirada exige disponibilidade na moeda solicitada.
- Fechamento preserva as quantias nativas e o snapshot da operação.
- Total consolidado deve indicar moeda e critério de conversão.
- Preserve fechamento cego, permissões, confirmações e guardas de concorrência existentes.

### 7.8 Clientes e fiado

- Dívida na moeda contratada.
- Recebimentos e baixas vinculados à obrigação correta.
- Pagamento em outra moeda registra cotação utilizada.
- Preserve saldo anterior, movimentação e saldo posterior.
- Não revalorize silenciosamente o principal da dívida pelo câmbio atual.

### 7.9 Fornecedores e contas a pagar

Aplique as mesmas regras de obrigação, vencimento, pagamento, baixa parcial, saldo e diferença cambial.

### 7.10 Despesas e recorrências

- Valor e moeda da obrigação preservados.
- Cada ocorrência gerada mantém referência à regra e sua versão.
- Mudança de preferência não muda a moeda de recorrências existentes.
- Não amplie o escopo para ativar pagamentos automáticos ou serviços não autorizados.

### 7.11 Devoluções e cancelamentos

- Vincule à operação original.
- Preserve valores, proporcionalidades e critérios originais.
- Não utilize automaticamente o câmbio atual.
- Registre a moeda do reembolso efetivo.
- Trate eventual diferença de forma explícita.
- Preserve devoluções parciais e evite duplicidade de estorno.

### 7.12 Comissões, metas e bônus

- Base monetária e moeda explícitas.
- Percentuais não recebem câmbio.
- Consolidação de vendas em moedas diferentes exige critério definido.
- Preserve a base histórica da comissão apurada.
- Não altere comissões antigas por mudança posterior de cotação.

### 7.13 Relatórios e dashboard

- Totais nativos separados por moeda.
- Consolidação identificada como equivalente.
- Critério e data do câmbio visíveis.
- Separe faturamento, recebimento, dinheiro físico, recebíveis, CMV, lucro e diferença cambial.
- Relatórios históricos usam os snapshots das operações.
- Consultas com câmbio atual devem ser identificadas como simulação, sem sobrescrever registros.
- Dados sem moeda comprovada não podem virar totais conclusivos por suposição.

### 7.14 Commerce

- Coerência de moeda entre vitrine, produto, carrinho, pedido, checkout e abertura no PDV.
- Preserve o preço aceito no pedido conforme sua política.
- Preserve o fluxo de pedidos online e sua arquitetura de economia de leituras.
- Não faça o pedido entrar antecipadamente nos documentos operacionais do Firestore se o fluxo atual prevê isso apenas ao abrir no PDV.
- Não introduza polling ou listeners desnecessários.

### 7.15 Fiscal

- Separe valores comerciais, fiscais e referências gerenciais.
- Preserve país de emissão selecionável.
- Conversão fiscal deve ser explícita e documentada quando aplicável.
- Não invente valores fiscais ou moedas ausentes no legado.
- Preserve documentos emitidos e snapshots existentes.
- Não ative emissão real nem altere integrações fiscais de produção nesta etapa.

### 7.16 Recibos, PDFs, impressão e compartilhamentos

- Use os valores e moedas do documento salvo.
- Não recalcule pelo câmbio do dia ao reimprimir.
- Preserve pagamentos e troco originais.
- Elimine BRL fixo onde a operação tenha outra moeda.
- Não exponha dados privados adicionais.

### 7.17 Importações, exportações, cadastros rápidos e Zen IA

- Use o mesmo contrato monetário.
- Exija moeda ou regra de importação comprovável.
- Não deduza moeda de um campo ambíguo.
- Exportações devem identificar valor, moeda e equivalências separadamente.
- Cadastros pelo PDV, atalhos e integrações não podem contornar o núcleo.
- Zen IA deve obedecer às mesmas validações e permissões.
- Não adicione provedor de IA pago ou ative serviços externos fora do escopo.

### 7.18 Outros fluxos encontrados

Inclua todos os demais consumidores monetários encontrados no inventário. Não considere esta lista uma autorização para ignorar funcionalidades não citadas.

## 8. Números que não são dinheiro

Diferencie explicitamente:

- Quantidade e saldo de estoque.
- Peso, volume, comprimento e unidade.
- Percentuais de margem, desconto e comissão.
- Contagens, metas quantitativas e indicadores.
- Códigos, documentos, IDs e SKUs.
- Datas, prazos e parcelas.

Esses números não recebem câmbio.

Quando produzirem resultado monetário, o resultado deve obedecer ao contrato monetário.

## 9. Histórico financeiro e auditoria

Ao concluir uma operação, registre uma fotografia dos:

- Itens.
- Quantidades.
- Custos e preços utilizados.
- Moedas.
- Descontos e acréscimos.
- Totais.
- Pagamentos e troco.
- Cotações aplicadas.
- Arredondamentos.
- CMV e resultado.
- Operador, empresa, data, versão e referências.

Depois de concluída:

- Mudança de câmbio não altera a operação.
- Mudança de preço ou custo do produto não altera a operação.
- Reimpressão não recalcula valores.
- Ajustes financeiros geram registros vinculados ao original.
- Preserve trilha de auditoria.
- Diferenças cambiais devem ser registradas separadamente, sem ocultá-las em preço, desconto ou caixa.
- Garanta idempotência para impedir operações duplicadas.

## 10. Proteção dos dados existentes e legado ambíguo

PROIBIDO executar conversão geral dos cadastros antigos.

O nome `precoBRL` ou `custoBRL` não prova sozinho a moeda pretendida, pois o defeito permitiu gravar valores de outra moeda nesses campos.

Também não é prova suficiente:

- País da empresa.
- Idioma.
- Moeda atualmente selecionada.
- Preferência atual da empresa.
- Método de pagamento.
- Magnitude do número.
- Cotação atual.

Classifique os registros:

### 10.1 Origem e moeda comprovadas

Adapte ao novo modelo preservando o significado e o valor.

### 10.2 Registro comprovadamente afetado

Prepare correção individual com evidências, antes/depois, moeda, cotação quando aplicável e trilha de auditoria.

Nesta etapa, apenas simule com fixtures; não execute correções reais.

### 10.3 Registro ambíguo

- Preserve o original.
- Marque a necessidade de conferência sem inventar moeda.
- Não corrija automaticamente.
- Operações dependentes daquele preço precisam de confirmação explícita de valor e moeda.
- Evite bloquear lojas e produtos comprovadamente corretos.
- Registre a resolução da ambiguidade quando houver evidência suficiente.

Não divida todos os preços por 230 nem aplique outra taxa em massa.

Não reescreva vendas ou históricos para acompanhar correções de catálogo.

## 11. Preparação de correções futuras

Implemente ferramentas revisáveis, sem execução em produção, para:

- Diagnóstico somente leitura.
- Classificação de evidências.
- Simulação de migração.
- Relatório por empresa e registro.
- Cópia verificável dos registros afetados.
- Comparação de revisão ou hash antes de aplicar.
- Aplicação idempotente e restrita aos registros aprovados.
- Auditoria do antes/depois.
- Recuperação compatível.

Se um registro mudar entre a simulação e a aplicação, a ferramenta deve interromper aquele ajuste e exigir nova conferência.

Não use cópia antiga para sobrescrever movimentações posteriores.

## 12. Compatibilidade e implantação gradual

A implementação deve ser aditiva e versionada.

- Não troque silenciosamente o significado dos campos BRL.
- Não renomeie campos em massa sem mapear todos os consumidores.
- Novos campos e adaptadores devem coexistir durante a transição.
- Defina qual representação é a fonte de verdade em cada versão.
- Campos de compatibilidade devem ter derivação controlada e rastreável.
- Não crie duas fontes de verdade editáveis independentemente.
- Dados antigos não devem ser migrados apenas por serem lidos.
- Valide contratos nas fronteiras de gravação.
- Preserve as transações, guardas e confirmações reais já existentes.
- Nenhum sucesso pode ser exibido antes de confirmação compatível com o fluxo existente.

Aproveite, após verificar seu estado atual, módulos como:

- `cashReconciliation`.
- `cashSession`.
- `cashMoneyInput`.
- `financialLedgerCore`.
- `fiscalCore`.
- `receiptCurrency`.
- `productionSync`.
- Outros módulos monetários e de sincronização encontrados.

Não reconstrua o que já atende ao contrato.

## 13. Versões antigas, offline e concorrência

- Cada operação nova deve carregar versão, moeda e cotação quando necessária.
- Operações offline preservam esses dados até sincronizar.
- Trocar a preferência ou o câmbio em outro terminal não altera o significado da operação pendente.
- Defina política explícita para cotação vencida.
- Operações incompatíveis não podem ser reinterpretadas automaticamente.
- Terminais antigos não podem sobrescrever estruturas novas ou gravar operações incompatíveis.
- A proteção deve existir na fronteira de persistência adequada; aviso apenas na interface não basta.
- Teste dois terminais com revisões diferentes.
- Garanta idempotência, isolamento por empresa e detecção de conflitos.
- Não amplie o consumo do Firestore para fazer essas verificações por polling.
- Não altere mecanismos de atualização automática de produção nesta etapa.

## 14. Economia de leituras Firestore

Preserve a arquitetura existente de cache, persistência e sincronização.

- Nenhuma nova varredura de coleções no carregamento.
- Nenhum novo listener por produto.
- Nenhum polling em lojas, produtos ou histórico.
- Nenhuma migração automática no login.
- Conversões e apresentação devem ser locais quando os dados necessários já estiverem disponíveis.
- Snapshots monetários devem acompanhar a operação, evitando consultas históricas repetidas.
- Auditorias extensas devem ser explícitas, limitadas e fora da inicialização normal.
- Demonstre, pelos caminhos de execução e testes adequados, o impacto das mudanças em leituras e gravações.
- Não afirme “zero leituras extras” sem evidência.

## 15. Reversão segura

Não considere seguro voltar simplesmente para uma versão que desconhece os novos dados.

Defina:

- Compatibilidade de leitura entre versões.
- Bloqueio de gravações incompatíveis.
- Desativação gradual de funcionalidades novas.
- Preservação das operações já concluídas.
- Tratamento de operações offline pendentes.
- Recuperação sem apagar eventos financeiros.
- Procedimento de retorno que não sobrescreva alterações posteriores.

Nenhuma estratégia de rollback pode depender de restaurar indiscriminadamente um banco antigo sobre dados recentes.

## 16. Sequência obrigatória de execução

### Etapa A — Inventário e diagnóstico

1. Inspecionar a versão atual do repositório.
2. Criar ou continuar a branch isolada.
3. Ler instruções aplicáveis.
4. Mapear campos, funções, componentes, relatórios e integrações monetárias.
5. Identificar conversões implícitas, BRL fixo, parsers inseguros e caminhos alternativos.
6. Criar matriz de cobertura com arquivo, fluxo, risco, contrato atual e tratamento previsto.
7. Registrar uma linha de base dos testes existentes.

### Etapa B — Contrato e núcleo

1. Documentar o modelo persistido.
2. Implementar precisão, parser, formatação, conversão e arredondamento.
3. Implementar snapshots e validações.
4. Criar adaptadores de legado.
5. Testar o núcleo antes de integrá-lo.

### Etapa C — Integração completa

Integrar progressivamente todos os fluxos do inventário, preservando compatibilidade e comportamento existente.

Cada etapa deve incluir leitores, gravadores, impressão, relatórios e atalhos relacionados.

Não marque um módulo como concluído corrigindo apenas sua tela.

### Etapa D — Legado e proteção operacional

1. Implementar classificação de registros.
2. Criar diagnóstico e simulação.
3. Proteger registros ambíguos.
4. Validar concorrência, offline, idempotência e versões antigas.
5. Testar recuperação em ambiente isolado.

### Etapa E — Homologação

1. Executar a matriz de testes.
2. Verificar o fluxo no navegador.
3. Conferir persistência e recarregamento.
4. Verificar relatórios, recibos e PDFs.
5. Confirmar isolamento do ambiente.
6. Disponibilizar preview ou ambiente testável.
7. Entregar instruções de teste objetivas.

### Etapa F — Revisão

1. Commits na branch.
2. PR em rascunho.
3. Relatório de cobertura e validação.
4. Pendências e riscos explícitos.
5. Aguardar minha validação sem merge ou publicação oficial.

## 17. Testes obrigatórios de aceitação

Não use apenas regex ou presença de nomes no código como prova de funcionamento.

Implemente testes comportamentais, de integração e de interface adequados ao risco.

Cubra:

1. Cadastrar Gs. 39.990 com PYG predeterminada.
2. Salvar, recarregar, reabrir, editar e vender mantendo o valor correto.
3. Custo e tabelas adicionais na moeda correta.
4. Alternar PYG → BRL → PYG sem alterar o cadastro persistido.
5. Mudar moeda predeterminada sem reinterpretar produtos antigos.
6. Mudar câmbio sem alterar preços originais.
7. Alterar explicitamente a moeda de precificação com auditoria.
8. Comprar em USD e vender em PYG.
9. Receber uma venda em BRL e PYG.
10. Cartão em PYG e BRL com contas/maquininhas distintas.
11. Troco em moeda diferente da venda.
12. Abertura, suprimento, sangria e fechamento por moeda.
13. Retirada sem saldo suficiente na moeda solicitada.
14. Fiado e baixa parcial em outra moeda.
15. Contas a pagar e receber.
16. Despesas recorrentes preservando sua moeda.
17. Devolução parcial após mudança de câmbio.
18. Cancelamento e repetição de estorno sem duplicidade.
19. Quantidades fracionadas, descontos e rateios.
20. CMV e lucro históricos preservados.
21. Comissões, metas e bônus com bases coerentes.
22. Commerce até abertura e conclusão no PDV.
23. Documentos fiscais em homologação, sem emissão real.
24. Recibos e PDFs reimpressos após mudança de câmbio.
25. Importações, exportações, atalhos e cadastros pelo PDV.
26. Zen IA usando as mesmas validações.
27. Legado comprovado em BRL.
28. Legado comprovado em PYG.
29. Legado ambíguo sem correção automática.
30. Cotação ausente, zero, negativa, inválida e vencida.
31. Entradas com separadores de PT, ES e formatos ambíguos.
32. Dois terminais concorrentes.
33. Operação offline e sincronização posterior.
34. Cliente antigo tentando gravar sobre dados novos.
35. Reenvio da mesma operação sem duplicidade.
36. Isolamento entre empresas.
37. Permissões de leitura, alteração de preço, câmbio e preferência.
38. Regressão dos fluxos BRL existentes.
39. Preservação de estoque negativo, identidade de produtos e sincronização.
40. Ausência de novos listeners, polling e downloads massivos.
41. Limites de precisão, valores elevados e arredondamentos.
42. Reversão compatível em ambiente isolado.

Registre os resultados reais. Se algum teste não puder ser executado, informe o motivo e não declare a respectiva funcionalidade homologada.

## 18. Entregáveis

Ao concluir, apresente:

- Branch e commit de origem.
- Commits implementados.
- Link do PR em rascunho.
- Link do ambiente isolado para teste, quando disponível.
- Confirmação verificável de que o ambiente não grava em produção.
- Documento da arquitetura final e contratos.
- Matriz completa de cobertura dos fluxos monetários.
- Arquivos alterados e finalidade das mudanças.
- Testes executados e resultados.
- Cenários ainda não validados.
- Relatório de compatibilidade com o legado.
- Ferramenta ou procedimento de diagnóstico e simulação.
- Estratégia de implantação por empresa e reversão compatível.
- Evidências do fluxo Gs. 39.990 do cadastro até venda, pagamento e relatório.
- Instruções curtas para eu realizar a homologação.

Não apresente como implementado o que foi apenas documentado.

Não declare risco zero, ausência de regressões ou preservação comprovada sem testes correspondentes.

## 19. Condições finais

- Trabalhe no projeto existente.
- Preserve o que funciona.
- Não faça conversões em massa.
- Não invente moeda de dados antigos.
- Não use preferência visual como moeda de origem.
- Não altere históricos por mudança de câmbio.
- Não permita duas fontes de verdade divergentes.
- Não deixe caminhos alternativos fora da integração.
- Não altere produção.
- Não faça merge.
- Não publique atualização oficial.
- Não encerre após criar apenas a branch ou entregar um plano: implemente e valide o escopo autorizado.
- Se houver impedimento real, conclua o trabalho independente que puder ser realizado com segurança e descreva o bloqueio com precisão.

OBJETIVO FINAL: disponibilizar uma versão de homologação do ZenOS com arquitetura multimoeda integrada a todos os fluxos monetários, preservação dos valores originais, compatibilidade com o legado, proteção contra conversões indevidas e evidências suficientes para minha validação antes de qualquer atualização oficial.
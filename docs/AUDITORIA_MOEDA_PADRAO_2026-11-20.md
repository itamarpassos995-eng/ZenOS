# Auditoria da moeda padrão — ZenOS (20/11/2026)

## Contrato
A moeda padrão é referência principal da loja. Preços nativos não mudam com cotação. Recebimentos e pagamentos em outra moeda exigem valor, moeda e cotação aplicados, congelados no evento. Proibido inventar moedas ou converter históricos pelo câmbio atual. Dados sem origem verificada são pendências.

## Matriz do código inspecionado

| Módulo | Evidência e risco | Ação |
|---|---|---|
| App/configuração | Callback da configuração usa moedaPadrao de fechamento antigo; pode alterar seleção manual ao voltar à aba | Corrigido com referência da última configuração |
| Início/caixa | Movimento priorizava equivalente BRL; devolução sem composição nativa podia parecer efetivamente R$ | Corrigir exibição: valor comprovado em moeda física, senão moeda não comprovada e BRL contábil secundário |
| Início/fiado | Saldo BRL convertido por taxa atual aparentava mudar de valor | Corrigir label e fixar apresentação BRL contábil até existir snapshot nativo suficiente |
| Início/financeiro | Faturamento, lucro, CMV e despesas em BRL eram convertidos a moeda visível pela taxa de hoje | Rotular BRL contábil sem conversão atual; reconstrução nativa futura depende de eventos |
| Histórico de vendas / segunda via | Totais e pagamentos históricos podiam usar moeda/taxa de hoje | Mostrar total nativo confirmado do documento e pagamento na moeda original; BRL contábil se sem origem |
| Vendas/devoluções | Movimento físico de devolução persiste somente valorBRL e detalhesMoedas BRL, sem prova da moeda física | CRÍTICO PENDENTE: exigir escolha e comprovação da moeda do reembolso antes de gravar |
| Despesas | Criação e edição usa cotação atual para valoresBRL e não persiste moeda original; pagamento de gaveta usa BRL | CRÍTICO PENDENTE: modelo de despesa nativa com cotação e pagamento físico por moeda |
| Clientes/fiado | Recebimento novo guarda moeda e valor nativos, mas dívida e limites são BRL contábeis | PENDENTE: conciliação dos saldos com documentos e livro |
| PDV e Compras | Documentos novos possuem moedaDocumento/totalOriginal e taxas; componentes podem recorrer a equivalência dinâmica | PENDENTE: homologação completa cobrança/recibo/edição |
| Auditoria de caixas | Motor V2 trabalha com moedas físicas quando disponíveis | Preservado. Não tocar no saldo/fechamento |
| Mesas | Venda do restaurante registra totalBRL sem totalOriginal/moedaDocumento | PENDENTE: gravar snapshot de moeda para novas vendas e auditar legados |
| Sincronização VIPE | Tela mostra erro de sincronização | CRÍTICO PENDENTE: investigar evento real no cliente |
| Outras telas | Comissões, mobile, IA e relatórios leem valores BRL e podem apresentar equivalências | PENDENTE: auditá-los individualmente |

## Segurança e evidência
O print de 20/11 mostra padrão PYG, devolução com -R$ 21,74 e composição monetária não disponível. Não prova a moeda física efetivamente entregue; BRL é apenas a equivalência existente.

Esta PR só muda apresentação de valores comprovados, indicadores contábeis e persistência da seleção de visualização. Não muda pagamentos, estornos, saldos, livros, dados fiscais, regras Firestore ou preços.

## Bloqueios de homologação
Para alterar escrituração é obrigatório provar fluxos completos BRL/PYG/USD/EUR: venda nativa; cobrança mista; devolução por moeda física; despesa; fiado; fechamento e conciliação V2; cambio antes/depois; concorrência e idempotência. Não migrar valores históricos sem auditoria somente de leitura, backup e identificação de moeda original.

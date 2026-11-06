# ORDEM MASTER — ZENOS DISTRIBUIÇÃO & LOGÍSTICA
## FASE 3.1 — ARQUITETURA FISCAL MULTINACIONAL, DEVOLUÇÕES, NOTAS DE CRÉDITO E ACERTOS FINANCEIROS

**Projeto:** ZenOS — `itamarpassos995-eng/ZenOS`  
**Branch existente:** `feat/distribution-logistics-foundation`  
**Último commit confirmado:** `bd65b2754a16bde9be17712fcc6683d6e18acd64`

**ATENÇÃO: ESTA É UMA ORDEM DE CONTINUIDADE, NÃO DE RECONSTRUÇÃO.**

Atue como uma equipe sênior de engenharia de ERP, arquitetura fiscal internacional, contabilidade, logística, segurança e desenvolvimento full-stack.

A Fase 3 de Distribuição & Logística já foi implementada e testada em homologação. Sua missão é finalizar os fluxos pendentes, acrescentando a arquitetura fiscal multinacional de devoluções e Notas de Crédito.

Não repetir as Fases 1, 2, 2.1 e 3. Verificar o HEAD antes de iniciar, preservar o código existente e aproveitar integralmente as funcionalidades entregues.

**Objetivo:** permitir que uma empresa realize vendas, expedições, entregas, devoluções totais ou parciais, substituições, ajustes fiscais, estornos e acertos financeiros dentro de um único fluxo consistente, respeitando a legislação do país emissor.

---

# 1. PRINCÍPIO FUNDAMENTAL — TRÊS OPERAÇÕES INDEPENDENTES

A arquitetura deve separar rigorosamente:

**A. Operação logística:** o que foi expedido, entregue, recusado, devolvido, extraviado, avariado ou substituído.

**B. Operação fiscal:** fatura original, Nota de Crédito, NF-e de devolução, NF-e de entrada, cancelamento, Nota de Remisión ou outro documento legalmente aplicável.

**C. Operação financeira:** abatimento de dívida, restituição de dinheiro, estorno de cartão, transferência, crédito comercial, compensação ou ajuste de caixa.

Uma operação não deve produzir efeitos nas outras duas sem cumprir os requisitos de autorização e confirmação próprios.

**Regra absoluta:** emitir uma Nota de Crédito não significa automaticamente devolver dinheiro; registrar devolução física não significa automaticamente emitir Nota de Crédito; emitir um ajuste fiscal não significa que a compensação financeira foi concluída.

---

# 2. MOTOR FISCAL MULTINACIONAL

Criar uma arquitetura extensível de regras fiscais por jurisdição, sem duplicar o ZenOS ou seu módulo fiscal atual.

Prioridades iniciais:

- Paraguai: DNIT, SIFEN, e-Kuatia/e-Kuatia'i e documentos eletrônicos correspondentes.
- Brasil: SEFAZ, NF-e, documentos de devolução, entrada, cancelamento e notas de crédito nos casos regulamentados.
- Outros países: contratos extensíveis, mas sem emissão habilitada antes da implementação de suas regras.

A escolha fiscal deve respeitar a jurisdição da empresa emissora, o estabelecimento, a natureza da operação, o tipo de documento, o destinatário e as regras de localização pertinentes.

**Não determinar legislação pela moeda utilizada na venda.**

Criar uma camada de regras fiscais versionadas que permita atualização sem reescrever os módulos de PDV, estoque e distribuição.

Antes de implementar regras específicas, consultar fontes oficiais e registrar a norma, sua vigência, âmbito de aplicação e requisitos técnicos.

Não inventar CFOP, CST, códigos tributários, prazos, formatos de XML, campos SIFEN, eventos de autorização ou critérios de incidência tributária.

Regras incertas devem permanecer bloqueadas para emissão real, com indicação de validação fiscal pendente.

---

# 3. PARAGUAI — NOTA DE CRÉDITO E DEVOLUÇÕES

Preparar o suporte às operações fiscalmente cabíveis de:

- Nota de Crédito Eletrônica vinculada à fatura original.
- Devolução total.
- Devolução parcial.
- Descontos e ajustes posteriores à faturação.
- Falta de mercadoria comprovada.
- Mercadoria entregue com avaria.
- Recusa de mercadoria.
- Substituição ou reposição.
- Cancelamento de documento fiscal, exclusivamente quando permitido.
- Nota de Remisión nos casos em que ela seja exigida ou aplicável.

Verificar a regulamentação atual da DNIT/SIFEN, inclusive requisitos de referência ao CDC, eventos do destinatário, consentimento quando exigível, prazos e diferenças entre sistemas de faturação eletrônica.

**Nunca confundir inadimplência com devolução fiscal.**

Uma fatura simplesmente não paga não autoriza a criação automática de uma Nota de Crédito.

A Nota de Crédito deverá conter o vínculo com a fatura, os itens, as quantidades, os valores, as referências fiscais e os motivos legalmente permitidos.

Preparar integração real com provedor SIFEN autorizado, aproveitando a infraestrutura fiscal já existente no ZenOS.

Nenhum documento poderá ser apresentado como aprovado sem confirmação real do órgão ou provedor fiscal competente.

---

# 4. BRASIL — DEVOLUÇÃO E DOCUMENTOS FISCAIS

Criar adaptador brasileiro independente.

Considerar, conforme as regras vigentes e o enquadramento da operação:

- NF-e de devolução.
- NF-e de entrada para retorno de mercadorias, quando cabível.
- Cancelamento autorizado.
- Eventos de recusa ou não entrega.
- NF-e com finalidade de Nota de Crédito, nos casos regulamentados.
- Devolução parcial ou total.
- Substituição de produtos.
- Ajustes fiscais vinculados à operação original.

Validar as normas aplicáveis do Ajuste SINIEF, da SEFAZ competente e as obrigações relativas à reforma tributária.

Não supor que um único documento fiscal sirva para todos os estados ou regimes tributários.

Os códigos fiscais, referências, impostos e efeitos contábeis devem ser resolvidos conforme configuração fiscal validada, não por valores fixos no frontend.

Preservar XML, chaves de acesso, protocolos, recibos, eventos e documentos originais.

---

# 5. CENTRAL DE OCORRÊNCIAS E AJUSTES FISCAIS

Implementar uma Central de Ocorrências integrada à Central de Distribuição.

Tipos iniciais:

- Falta de mercadoria na separação.
- Falta na entrega.
- Entrega parcial.
- Avaria.
- Recusa total.
- Recusa parcial.
- Devolução posterior.
- Produto incorreto.
- Substituição.
- Extravio.
- Divergência entre fatura e entrega.

Cada ocorrência deverá permitir registrar:

- Empresa e estabelecimento.
- Pedido e venda original.
- Fatura ou documento fiscal correspondente.
- Romaneio e viagem.
- Cliente e vendedor.
- Produto, unidade e quantidade.
- Valor e moeda original.
- Motivo e descrição.
- Fotografias, assinatura e evidências quando aplicáveis.
- Responsável e permissões.
- Datas do acontecimento e da confirmação no servidor.
- Estado logístico, fiscal e financeiro, separadamente.

Criar histórico auditável e impedir duplicidade de ocorrências ou ajustes associados ao mesmo fato.

Uma ocorrência poderá resultar em vários desdobramentos autorizados, mas jamais em compensações repetidas.

---

# 6. VENDAS À VISTA E A PRAZO

## 6.1 Venda a prazo

Após ajuste fiscal válido e autorização financeira:

- Identificar a dívida original.
- Determinar o saldo efetivamente aberto.
- Abater o valor autorizado no contas a receber.
- Preservar parcelas já quitadas e histórico de pagamentos.
- Tratar eventual valor pago em excesso como restituição ou crédito comercial autorizado.
- Não registrar recebimento negativo fictício.
- Não duplicar descontos nem compensações.

O lançamento deve ser rastreável à venda, à ocorrência, ao ajuste fiscal e à aprovação financeira.

## 6.2 Venda à vista

Permitir, conforme autorização e regras aplicáveis:

- Devolução de dinheiro físico.
- Estorno de cartão.
- Transferência.
- Crédito comercial para compra futura.
- Substituição do produto.

Cada modalidade deve ter controle próprio.

O ZenOS não deverá marcar um reembolso como realizado apenas porque o operador solicitou a operação.

Estornos externos dependem de confirmação do meio de pagamento ou de evidência de execução.

## 6.3 Venda parcialmente paga

Criar tratamento específico para vendas com parte paga e parte pendente.

Primeiro reconciliar a dívida, os valores já recebidos e as compensações existentes.

Não gerar saldo credor ou reembolso sem verificar o histórico.

---

# 7. ESTORNO EM DINHEIRO E CAIXA MULTIMOEDA

Reutilizar o caixa multimoeda existente do ZenOS.

Para devoluções físicas em espécie:

- Validar operador e permissão.
- Validar sessão de caixa aberta.
- Identificar a moeda original e a moeda efetivamente devolvida.
- Verificar saldo disponível conforme a política de caixa.
- Exigir confirmação e comprovante.
- Registrar saída de caixa vinculada à ocorrência.
- Gerar documento e lançamento financeiro correspondentes quando autorizados.
- Manter idempotência absoluta.

**Jamais somar PYG, BRL, USD e EUR como se fossem a mesma moeda.**

Conversão entre moedas deve exigir autorização explícita, taxa registrada e comprovação da operação.

Preservar valores históricos sem conversões retroativas.

---

# 8. DEVOLUÇÃO FÍSICA E ESTOQUE V2

Reutilizar a arquitetura de estoque V2 já implementada.

Separar:

1. Mercadoria em trânsito.
2. Mercadoria recusada.
3. Mercadoria devolvida.
4. Mercadoria aguardando conferência.
5. Mercadoria aprovada para reintegração.
6. Mercadoria avariada em quarentena.
7. Mercadoria substituída ou baixada definitivamente.

A entrada no estoque vendável somente poderá ocorrer após conferência e autorização.

Nunca aumentar estoque duas vezes para uma mesma devolução.

Manter rastreabilidade de custo, quantidades, origem, lotes quando suportados, pedido e fatura.

Não criar outro cadastro de produtos ou estoque paralelo.

---

# 9. SUBSTITUIÇÕES E REPOSIÇÕES

Implementar fluxo específico quando o cliente deseja receber outro produto ou completar quantidades faltantes em vez de receber dinheiro.

Exigir:

- Referência ao pedido original.
- Registro da ocorrência.
- Nova separação autorizada.
- Controle de carga e romaneio.
- Tratamento fiscal correspondente, quando exigido.
- Reserva e movimentação de estoque corretas.
- Prevenção contra faturamento ou baixa duplicada.

A substituição não poderá ser tratada automaticamente como venda nova nem como simples estorno.

---

# 10. CONCILIAÇÃO FISCAL E FINANCEIRA

Criar uma visão de conciliação que mostre, em campos independentes:

- Valor da venda original.
- Valor fiscal ajustado.
- Valor efetivamente recebido.
- Valor ainda devido.
- Valor devolvido.
- Valor disponível como crédito comercial.
- Valor de mercadoria em trânsito ou devolvida.
- Pendências fiscais.
- Pendências financeiras.
- Divergências de caixa e acerto.

Permitir reconhecer diferenças justificadas por usuários autorizados, com trilha de auditoria.

**Não lançar receita, despesa, perda ou ganho automaticamente para esconder divergências.**

Impedir pagamento duplicado, desconto repetido, estorno em duplicidade e encerramento falso de acertos.

Preservar a escrituração e os contratos financeiros existentes.

---

# 11. DOCUMENTOS, IMPRESSÃO E HISTÓRICO

Produzir documentos profissionais, no padrão visual ZenOS:

- Relatório de ocorrência.
- Comprovante de devolução física.
- Comprovante de estorno financeiro.
- Relatório de conferência.
- Comprovante de substituição.
- Espelho de Nota de Crédito ou devolução fiscal.
- Histórico de documentos fiscais aprovados.
- Segunda via de documentos.

PDFs e impressões devem preservar os snapshots originais e indicar claramente o estado fiscal.

Um espelho ou documento interno não poderá se apresentar como documento fiscal eletrônico autorizado.

Permitir reimpressão de documentos antigos sem recalcular preços ou câmbio usando valores atuais.

---

# 12. SEGURANÇA E AUTORIZAÇÕES

Reutilizar o sistema de usuários, PIN e permissões existente.

Criar ou ampliar permissões granulares, conforme necessário, para:

- Registrar ocorrência.
- Conferir devolução.
- Autorizar reintegração.
- Solicitar ajuste fiscal.
- Autorizar emissão fiscal.
- Aprovar restituição.
- Executar estorno de caixa.
- Resolver divergência.
- Consultar auditorias.

Todas as autorizações críticas devem ser verificadas no servidor.

Utilizar revisões otimistas, transações, recibos idempotentes e trilhas imutáveis.

Não confiar em valores, permissões ou documentos enviados diretamente pelo frontend.

---

# 13. OFFLINE, CONFLITOS E MOTORISTA

Finalizar a robustez da operação offline iniciada na Fase 3.

Testar:

- Fechamento do aplicativo sem conexão.
- Reabertura offline.
- Permanência da fila local.
- Reconexão.
- Comandos repetidos.
- Conflitos de revisão.
- Operador com permissão revogada.
- Aplicativo fechado durante sincronização.

Não armazenar PIN ou credenciais sensíveis de forma insegura.

Ações offline não podem aparecer como confirmadas até validação do servidor.

Documentos fiscais e estornos financeiros não poderão ser declarados executados sem confirmação remota.

Implementar resolução assistida para conflitos comerciais, preservando o histórico de tentativas e impedindo compensações duplicadas.

---

# 14. CONTROL CENTER E HABILITAÇÃO COMERCIAL

Preparar integração com o ZenOS Control Center existente.

O módulo Distribuição deve ser habilitado comercialmente por empresa, conforme permissões e contratação.

Não reconstruir o Control Center nem criar outro painel administrativo.

Preservar isolamento multitenant, segurança e baixo consumo de Firestore.

Se a integração depender de contratos ainda não disponíveis, implementar adaptadores de homologação e registrar o bloqueio sem alegar que o serviço real está pronto.

---

# 15. DESEMPENHO E ECONOMIA FIREBASE

Preservar a arquitetura atual de cache e sincronização.

Obrigatório:

- Carregamento sob demanda.
- Paginação.
- Filtro Hoje como padrão.
- Nenhum listener novo no boot do ZenOS quando Distribuição estiver desativada.
- Consultas restritas à empresa.
- Nada de baixar histórico completo para emitir um ajuste.
- Nenhum polling desnecessário.
- Operações idempotentes e transacionais.

Não migrar para PostgreSQL apenas por conveniência. Qualquer mudança estrutural deverá ter justificativa técnica, homologação e autorização separada.

---

# 16. TESTES OBRIGATÓRIOS

Criar cenários sintéticos de:

1. Venda à vista com devolução parcial.
2. Venda a prazo com abatimento de dívida.
3. Venda parcialmente quitada com devolução.
4. Falta de mercadoria na entrega.
5. Avaria e quarentena.
6. Recusa total.
7. Recusa parcial.
8. Substituição de produto.
9. Solicitação fiscal recusada ou pendente.
10. Emissão fiscal simulada com protocolo fictício claramente identificado.
11. Estorno em espécie.
12. Crédito comercial futuro.
13. Estorno de cartão pendente e posteriormente confirmado.
14. Concorrência PDV e Distribuição.
15. Cancelamento ou repetição de comando.
16. Queda de rede e retomada.
17. Operador sem permissão.
18. Empresa paraguaia em PYG com recebimento em BRL.
19. Empresa brasileira com devolução fiscal apropriada.
20. Preservação de documentos históricos e taxas originais.

Testar no Firebase Emulator e em navegador desktop/mobile.

Não usar credenciais fiscais reais nem emitir documentos de produção.

Exigir aprovação de regressões dos módulos existentes de caixa, PDV, estoque, multimoeda, financeiro e logística.

---

# 17. ENTREGA E CONDIÇÕES ABSOLUTAS

Entregar:

- Código implementado na branch existente.
- Commit e lista de arquivos alterados.
- Arquitetura fiscal documentada por país.
- Matriz de regras fiscais com fontes oficiais, vigência e status de validação.
- Testes executados e resultados.
- Evidências visuais desktop/mobile.
- PDFs e documentos de homologação.
- Relatório de integridade de estoque e financeiro.
- Relatório de pendências fiscais e técnicas.
- Lista objetiva de requisitos para ativação comercial.

**Proibido:**

- Fazer merge na `main`.
- Publicar em produção.
- Executar migrações em dados reais.
- Alterar qualquer empresa existente.
- Criar infraestrutura paga.
- Simular sucesso de emissão fiscal.
- Emitir documento eletrônico real sem credenciamento e autorização.
- Tratar emissão de Nota de Crédito como reembolso concluído.
- Recalcular movimentos históricos pela moeda padrão atual.
- Criar outro PDV, outro caixa, outro estoque ou outra contabilidade.

A comparação com regras oficiais instaladas, segurança do endpoint hospedado, integração definitiva com o Control Center, credenciamento dos provedores fiscais e homologação de impressora física continuam como critérios de liberação separados.

**REGRA FINAL:** quero um sistema multinacional completo e juridicamente configurável, no qual um motorista registre uma falta ou avaria e o ZenOS conduza a conferência, os documentos fiscais cabíveis e o acerto financeiro correto, sem lançamentos duplicados e sem comprometer qualquer empresa já existente.

Implementar efetivamente o escopo seguro em homologação. O que depender de confirmação legal, provedor fiscal ou autorização externa deverá ficar preparado, documentado e bloqueado para emissão real, nunca ser apresentado como funcionalidade homologada sem evidência.
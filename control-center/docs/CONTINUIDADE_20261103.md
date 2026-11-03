# Continuidade do Control Center — 03/11/2026

## Fonte visual preservada

`src/server/control-center-ui.mjs` gera o layout aprovado: menu azul-marinho, conteúdo claro, cartões brancos, turquesa, cabeçalho e navegação original. A estrutura e os valores de estilo da interface premium foram preservados. A imagem de referência mostra oito empresas importadas; esse número não foi fixado no código.

PR #160: mesclado na homologação (`7622826b8c0f58b0ca216dc5768dbb8a469acfba`). PRs #161 e #162: rascunhos, abertos na auditoria; ambos tinham checks falhando. Falhas reproduzidas: API/repositório carregavam 1000 registros enquanto os testes exigiam padrão 25 e teto 100. Corrigido no código consolidado. Nenhum merge em main foi feito.

## Funcionalidade implementada neste conjunto

- Uma linha por empresa com Gerenciar expansível; busca SQL, país, estado comercial e ordenação, página de 25, filtros preservados ao salvar. Histórico e comandos por empresa são carregados sob demanda.
- Plano/módulo e preços BRL/PYG/USD/EUR; preço editado mantém histórico temporal. Assinatura comercial, pedidos de troca de plano/cancelamento, notas internas e concessões temporárias.
- Cobrança avulsa, recebimentos manuais parciais, desconto, cancelamento sem pagamento, isolamento da moeda, serialização por fatura, chave de idempotência e auditoria.
- Recorrência mensal no processo servidor, chave única assinatura/período, recuperação de períodos pendentes na inicialização. Não há gateway ou débito automático. Free Render pode dormir; horário exato de execução não é garantido sem executor sempre ativo.
- Receita de pagamentos confirmados agrupada por moeda/mês, atividades reais, crescimento de cadastros e fila de comandos; sem números fabricados.
- Transporte incremental assinado HMAC com limite de tempo, inbox idempotente e controle de eventos atrasados. Atualiza nome e país. Desativado por padrão.
- Comandos com motivo, identificação exata da empresa para suspensão/reativação, permissões consultadas no banco, revisão, outbox, lease, backoff, oito tentativas e confirmação assinada vinculada ao hash do pedido. Estado solicitado nunca se apresenta como aplicado. Bônus só altera vigência depois do ACK, uma única vez.
- Migração **nova** 004 com registro de versão e checksum, transação e exclusão mútua. Runner não executa 001, 002 ou 003. Migração antiga não foi repetida no banco remoto.

## Limites e gates de publicação

Este conjunto não está homologado visualmente no navegador: o navegador remoto não alcança localhost. Publicação/merge ficam retidos até validação visual de desktop e celular. Os testes usam PostgreSQL embutido PGlite e empresas sintéticas exclusivamente locais. Não são comprovação do fluxo real em produção.

Integração exige `CONTROL_CENTER_INTEGRATION_ENABLED=true`, segredo servidor a servidor >=32 caracteres e origem HTTPS do adaptador. **Não configurar em produção sem autorização.** Não reutilizar a chave de criptografia de MFA como segredo de transporte.

O adaptador produtor/aplicador do ZenOS ainda precisa ser implementado e validado em emulador/ambiente não produtivo. O endpoint esperado é `/internal/control-center/commands`; a resposta deve conter commandId, organizationUid, revision, state=applied, requestHash SHA256 do corpo recebido, assinada em `x-zenos-signature` com timestamp de 13 dígitos em `x-zenos-timestamp`. ACK só pode ser emitido depois da aplicação efetiva e transacional. Envelopes de entrada usam contrato events.v1 em `/internal/events`.

### Bloqueio real ainda NÃO está liberado

No código atual da main, App.jsx lê `lojas/{uid}` no login, usa status e concede teste inicial de sete dias. Não acompanha revogação de autorização em todas as sessões/rotas de escrita. Alterar só status ou só esconder a interface **não é bloqueio real**.

`firebase.json` aponta para regras de EMULADOR (`firestore.emulator.rules`), explicitamente proibidas para deploy em produção e permissivas para qualquer autenticado. As regras realmente implantadas não foram obtidas nem presumidas. É necessário auditar regras implantadas, servidor, sessões ativas e pagamentos em andamento antes de ativar suspensão, módulos e liberação reais. Nenhuma regra foi publicada.

### Pendências funcionais adicionais

- Adaptador ZenOS, produtor de eventos e confirmação efetiva, com teste de revogação de sessão e proteção de gravações.
- Reconciliação autenticada controlada, retentativa manual após oito falhas e observabilidade operacional completa.
- Promoções agendadas, automação de carência e expiração de acesso, edição de todas as condições da assinatura, reembolso/estorno formal e paginação financeira além da visão recente.
- Exportação e relatórios mais amplos; o gráfico básico já usa pagamentos confirmados, separados por moeda.
- Revisão visual desktop/celular e teste ponta a ponta publicado com conta autorizada.

Produção, Firebase, credenciais existentes e dados reais dos clientes permanecem intactos. Nenhum serviço ou plano pago foi criado.

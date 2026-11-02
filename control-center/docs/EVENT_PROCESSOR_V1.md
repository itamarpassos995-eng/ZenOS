# Processador transacional V1 — sem conexão com clientes reais

O código `src/server/event-processor.mjs` recebe eventos **após** autenticação do serviço emissor, insere inbox em transação, atualiza organização por Firebase UID e registra pedidos comerciais. Uma falha executa rollback para permitir reentrega. Evento duplicado não reaplica efeitos.

O processamento `trial.started.v1` apenas verifica a organização: **não inventa dias de teste, não cria uma assinatura paga, não altera o teste imediato atual**.

Limitações:
- Emissor confiável e durável, credencial de serviço, mecanismo de retries/ordenação e endpoint HTTPS ainda faltam.
- Banco Render de homologação ainda não recebeu migration comprovada.
- Os testes deste módulo usam cliente SQL simulado. Migration foi validada separadamente em PostgreSQL descartável na CI.
- A sincronização de produção NÃO está ativada. Nenhum listener Firestore ou evento é criado no aplicativo.
- A lógica de operações fora de ordem ainda precisa de estratégia de retry/dead-letter em trabalhador durável.

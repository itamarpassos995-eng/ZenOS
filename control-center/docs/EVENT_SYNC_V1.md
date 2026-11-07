# Sincronização por eventos — próxima fase segura

**Este pacote é lógica isolada, não está conectado ao Firebase ou aos clientes reais.**

## Plano
1. O cadastro mantém o fluxo atual Firebase Auth -> documento de loja -> liberação imediata do teste. A API da Central jamais fica no caminho crítico do cadastro.
2. Escolher e implantar um emissor **server-side durável**, preferencialmente um trigger no documento de organização (após confirmar as regras de criação e funções existentes). Eventos de módulo vêm dos handlers autenticados que já recebem solicitações.
3. Emissor registra evento com ID determinístico, UID da empresa e payload comercial mínimo, em uma outbox durável ou equivalente. Evitar listeners no frontend. Não ler coleções de vendas/estoques/clientes finais.
4. Worker entrega à API Control Center por autenticação de serviço (HMAC com timestamp/nonce ou identidade de workload), com retries e reconciliação. Nunca colocar chave no navegador.
5. API autentica primeiro o produtor e fixa o UID de origem confiável; valida envelope e salva inbox com UNIQUE(event_id) em transação.
6. Atualiza ficha comercial a partir de eventos aceitos; projeta dashboard por SQL sem consultas ao Firestore.
7. Se a Central falhar, o cadastro/teste continua funcionando, e evento permanece na fila. Se evento duplicar, único efeito comercial.
8. A sincronização na interface pode usar polling **da API administrativa** moderado ou SSE autenticado, não listeners Firestore. Atualização quase em tempo real depende da fila, entrega e disponibilidade; não prometer tempo exato sem medir.

## Restrição de custos
Disparo de evento por cadastro ou pedido pode ter custos de gravação, execução de função e/ou leituras pontuais; o objetivo é eliminar consultas e listeners repetitivos. Confirmar métrica de custo antes de ativar em produção.

## Gate
Não implantar triggers nem armazenar credenciais de serviço antes da homologação do Control Center e da escolha do sistema de autenticação administrativa. Não abrir o PostgreSQL à internet para facilitar a migração.

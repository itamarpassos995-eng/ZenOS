# Contratos de eventos — proposta V1 (não ativada)

Envelope recomendado:
```json
{
  "eventId": "uuid-estavel-de-origem",
  "eventType": "organization.registered.v1",
  "version": 1,
  "organizationUid": "firebase-uid-da-loja",
  "occurredAt": "2026-11-01T12:00:00.000Z",
  "source": "zenos-backend",
  "payload": {"displayName": "Loja Exemplo", "country": "PY"}
}
```
Eventos iniciais: `organization.registered.v1`, `trial.started.v1`, `commercial.requested.v1`, `subscription.changed.v1`, `invoice.issued.v1`, `payment.confirmed.v1`.

Regras:
- O UID do tenant deve vir de uma identidade validada pelo servidor; não confiar cegamente em `organizationUid` enviado pelo navegador.
- `eventId` nunca muda nas retentativas. Inserir `inbox_events` sob transação e ignorar repetição já processada.
- Gravar o evento em origem durável ou trigger confirmado, sem tornar a central requisito para completar cadastro/teste.
- Validar versão, timestamp, assinatura, tamanho e forma do payload no servidor.
- Falhas de processamento são recuperáveis; não perder eventos e não repetir efeitos financeiros.
- Não transmitir dados operacionais da empresa (vendas, produtos, estoque, clientes finais).
- A primeira carga de empresas existentes requer conciliação controlada e não é coberta por esse contrato.

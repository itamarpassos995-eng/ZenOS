# Decisões do piloto

| ID | Questão | Opção conservadora adotada | Alternativas | Impacto | Decisão do proprietário |
|---|---|---|---|---|---|
| D01 | País, moeda e idioma | Paraguai, PYG, es-PY com português disponível | — | Recebimento nativo PYG pendente | Decidido pelo proprietário |
| D02 | Retorno e abatimento | Registrar retorno físico e preservar dívida | Procedimento financeiro autorizado | Abatimento automático fora do piloto e dependente da Entrega C | Definir política de abatimento |
| D03 | Saldo em entrega parcial | Receber somente até o valor entregue e o saldo verificado | Revisão comercial autorizada | Saldo permanece no pedido original | Definir tratamento comercial da diferença |
| D04 | Divergência de caixa | Impedir acerto com diferença | Política auditada com responsável designado | Custódia permanece pendente | Designar autorizador e procedimento |
| D05 | Cheque e confirmação bancária | Consulta histórica e encaminhamento manual | Integrar confirmação verificável em outra etapa | Sem liquidação bancária no piloto | Definir procedimento futuro |
| D06 | Fiscal | Documento logístico interno e encaminhamento separado | Integração fiscal homologada | Emissão eletrônica fora do piloto | Definir procedimento manual |
| D07 | Staging externo | Homologar no Emulator isolado | Provisionar backend e Firebase isolados com Auth e acesso protegido | Preview do frontend não é staging operacional | Indicar ambiente isolado e responsáveis pelo acesso |

O piloto roda em paralelo ao sistema fiscal atual. Os documentos internos permanecem sem valor fiscal. Fatura e nota de remisión são emitidas fora do ZenOS. A integração futura exige credenciamento, certificado, contratos oficiais vigentes, ambiente de homologação, vínculo documental, processamento dos estados e autorização de produção.

| ID | Questão | Padrão até decisão |
|---|---|---|
| PY01 | Com que frequência há cheques? | Observação na ocorrência, sem liquidação |
| PY02 | Há venda em USD? | Sem conversão ou recebimento automático |
| PY03 | Devolução exige nota de crédito, abatimento ou troca? | Retorno físico separado, sem abatimento |

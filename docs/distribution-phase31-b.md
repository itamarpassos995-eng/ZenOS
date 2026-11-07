# ZenOS Distribuição — Fase 3.1 / Entrega B
## Ajustes comerciais e rascunhos fiscais internos BR/PY — implementação segura em homologação

Branch: `feat/distribution-logistics-foundation`. MASTER, 259 requisitos e 20 cenários intactos; não há merge nem deploy. Esta documentação não substitui a fonte normativa nem declara emissão fiscal homologada.

### Componentes implementados

- `src/core/distribution/phase31Commercial.js`: contrato independente para proposta comercial; total e parcela calculados somente do snapshot da venda V2, dinheiro em minor units (`BRL/PYG/USD/EUR`), preço BRL histórico apenas como origem gerencial, câmbio original conservado, tipo de ajuste limitado pelo motivo logístico comprovado, transições internas versionadas, candidato fiscal estritamente por país e espelho marcado **DOCUMENTO INTERNO — SEM VALIDADE FISCAL** / **SIN VALIDEZ FISCAL**. Sem chamadas a SEFAZ/DNIT, estoque ou caixa.
- `operational-functions/src/distribution/commercialService.js`: `adjustmentCommand` e `adjustmentQuery` em Firestore Emulator, autenticação/PIN via `authorize`, isolamento pelo UID Firebase, revisão e recibos idempotentes, travas transacionais por ocorrência **e** linha de venda, conservação de representações históricas por revisão, evento imutável e outbox LOCAL_ONLY. Rejeição/cancelamento de rascunhos internos liberam reserva sob guarda de ausência de emissão. Nenhum writer financeiro montado.
- `operational-functions/src/distribution/service.js`, `server.js`, `src/core/distribution/client.js`: rotas de homologação existentes estendidas com `/adjustment-command` e `/adjustment-query`, sem endpoint de produção.
- `src/components/DistributionCommercial.jsx` e `.css` integrados em `DistributionOccurrences.jsx`: criação, lista por ocorrência, histórico/versão de espelho, revisão comercial e fiscal, cancelamento/rejeição, PT/ES e impressão nativa do navegador. O botão de impressão não gera documento eletrônico nem representa autorização fiscal.
- `scripts/distribution/phase31-commercial.test.mjs`, `operational-functions/test/distribution/commercial.test.mjs` e extensões da jornada Chromium: controle de valores originais, BR/PY, permissões, reservas concorrentes, imutabilidade, status fiscal não autorizado e integridade de estoque/financeiro.

### Segurança e limitações intencionais

1. **Documento fiscal:** tipos BR/PY são somente candidatos. `fiscalEligibility='LEGAL_REVIEW_REQUIRED'`, `authorized:false`, `transmitted:false`, nenhum protocolo. O ZenOS Fiscal já existente mantém seus próprios contratos; a integração final de formato/certificação exige provedor e parecer oficial. Não habilitar notas fiscais reais.
2. **Recebimentos e crediário:** saldos quitados, parcelas, créditos de cliente e comprovantes de recebimento não podem ser deduzidos de `sale.totalOriginal` ou do cadastro corrente. Até integração validada ao subledger V2, a proposta grava `RECONCILIATION_REQUIRED`, nunca um valor arbitrário de abatimento, saldo pago ou restituição.
3. **Multimoeda:** a moeda e taxa são da venda original. Não existe conversão por alteração da moeda padrão; país fiscal deriva da configuração da empresa.
4. **Rascunho comercial e fiscal:** revisão interna não é emissão; a passagem de `LEGAL_REVIEW_REQUIRED` para aprovação final está bloqueada sem parecer fiscal validado e um contrato de evidência legal. Rejeitar/cancelar não executa estorno ou devolução física.
5. **Impressão:** espelho interno histórico é gravado por versão imutável no Firestore Emulator; interface oferece impressão do navegador. PDF definitivo e persistência do arquivo binário em storage privado não foram homologados.
6. **Documentação original:** o documento de origem é um snapshot de referência associado à ocorrência A.3, mas a referência interna não substitui conferência de autorização real no órgão fiscal.
7. **Produção:** `requireEmulators()` continua exigido pelo serviço existente. Não há migração, mudança de Firestore de cliente, instalação de regras ou índices em produção, nem Control Center acionado.
8. **Capacidade de ajuste:** reserva por ocorrência e também por linha de venda, mesmo quando existem dois fatos diferentes. Variações de taxa e pagamento ficam em observação documental e não acionam motor de cobrança.

### Fontes fiscais oficiais consultadas — usar como referência, não como elegibilidade automática

- Paraguai, DNIT — Resolução Geral 05/18: https://www.dnit.gov.py/en/web/portal-institucional/w/resolucion-general-n-05-18-1 (regulamentação de Nota de Crédito Eletrônica, documento associado e exigências do SIFEN, originalmente ambiente piloto).
- Paraguai, DNIT — regulamentação vigente do Decreto 872/2023 e Manual Técnico SIFEN: https://www.dnit.gov.py/documents/20123/1259326/DECRETO_872.pdf/10a38d31-769f-388d-103f-6f5de177730d e https://www.dnit.gov.py/documents/20123/420592/Manual%2BT%C3%A9cnico%2BVersi%C3%B3n%2B150.pdf/e706f7c7-6d93-21d4-b45b-5d22d07b2d22.
- Brasil — Portal oficial NF-e, MOC e notas técnicas, incluindo Nota Técnica 2025.002 RTC: https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?AspxAutoDetectCookieSupport=1&tipoConteudo=ndIjl+iEFdE%3D.
- Brasil — Ajuste SINIEF 49/2025, texto vigente e alterações posteriores no CONFAZ: https://www.confaz.fazenda.gov.br/legislacao/ajustes/2025/ajuste-sinief-49-25.

**Não foram codificados prazos, regras de tributação, eventos XML ou critérios finais com base nesses textos.** É necessário verificar o texto consolidado vigente, UF/regime, qualificação do destinatário e consulta profissional antes de transmissão real.

### Requisitos vinculados à Entrega B

Rastreio parcial: `D31-02-001..011` (contrato por país), `D31-03-001..017` (candidatos PY), `D31-04-001..014` (candidatos BR), `D31-05-*` (origem logística), `D31-06-*` (proposta sem execução financeira), `D31-10-*` (documentos internos), `D31-12-*` (autorização), `D31-15-*` (leitura sob demanda) e `D31-16-*` (testes).

Nenhum dos **259 itens** é elevado a `CONCLUÍDO` por padrão. Critérios que envolvam autorização real, saldo a prazo, reimpressão fiscal válida ou execução de pagamentos permanecem **BLOQUEADO/PARCIAL**.

### Aceite e próximos passos

Consultar o CI real vinculado ao SHA testado e a matriz para resultados efetivamente aprovados. Falhas intermediárias de ajuste de fixtures não devem ser apagadas nem confundidas com regressões não corrigidas.

Pendências desta entrega: conciliar pagamentos reais do crediário em homologação, definir trilha de revisão legal formal, completar impressão documental em PDF persistido, ampliar cenários por país e validar as fontes fiscais vigentes. Não avançar para estornos da Entrega C antes dessas proteções e autorização adicional.

**Sem merge, deploy, dados reais, emissão fiscal, lançamentos financeiros ou mutações de estoque nesta execução.**

# Distribuição & Logística — Fase 2.1

Base: `d410a0caee0b0650e6040a1da96a6a177410878e`, na mesma branch `feat/distribution-logistics-foundation`. Somente dados sintéticos e emuladores; nenhuma migração, merge ou publicação de produção.

## Entrega operacional

O PDV existente resgata o pré-pedido logístico e liquida o mesmo registro, preservando cliente, vendedor, itens, preços, moeda original e câmbio histórico. O operador autentica seu PIN no servidor, com permissão de PDV e caixa aberto próprio. A transação grava venda, financeiro, dívida/vale quando aplicável, recibo idempotente e auditoria juntos. Não escreve estoque nessa liquidação. Repetições retornam o recibo confirmado; requisições divergentes conflitam.

Entregas físicas parciais permanecem possíveis após a liquidação comercial integral. Exemplo validado: estoque inicial 10, primeira expedição 2, liquidação, segunda expedição 3, saldo final 5 e um lançamento financeiro. Esta etapa não oferece cobrança comercial fracionada por entrega.

A entrada requer homologação, flag, permissão existente e habilitação comercial confiável no controle V2. O servidor verifica habilitação e validade novamente. A projeção comercial não pode ser alterada pelo cliente nas regras de homologação. O módulo continua sob demanda: usa o controle já carregado, sem consulta ou listener adicional no boot desativado.

## Validação executada

| Verificação | Resultado |
|---|---|
| Backend transacional no Firebase Emulator | 23 testes aprovados |
| Escritores reais PDV/V2 e Distribuição sob regras V2 cercadas | 19 assertivas aprovadas |
| Domínio, cliente e contratos | 21 testes aprovados |
| Interface integrada e impressão | 3 testes aprovados |
| Regressões de interface existentes | 15 testes aprovados; verificações de release aprovadas |
| Chromium real desktop 1440×1050 e celular 390×844 | 17 cenários, nenhum erro de página |
| Build | aprovado; aviso existente de tamanho de chunk Firebase |
| PDF A4 e segunda via histórica | renderizados; impressão isolada de uma página |
| PDF extenso sintético | 9 páginas; teste de paginação, não prova financeira |

As corridas usam `persistV1BusinessOperationSafe` → escritor V2 real e o serviço transacional real de Distribuição. Cobrem venda contra reserva da última unidade, cancelamento/liberação, expedição contra venda, comandos repetidos, retomada após recarregar estado e bloqueio de adulteração de reservas, pedido logístico e habilitação. Cobrem dívida lançada uma vez, troco PYG com pagamento BRL, precisão monetária, caixa fechado, carrinho adulterado e câmbio forjado.

As regras são derivadas da cerca V2 existente em `scripts/recovery/v2-fenced-prototype.rules`, acrescida dos invariantes de reserva e propriedade logística. Testam protocolo equivalente de geração/revisão/recibo/patch/auditoria com os escritores reais. Não foram comparadas byte a byte às regras atualmente instaladas em produção e não foram publicadas. A aprovação desta homologação não autoriza implantação dessas regras.

## Evidências

- [Central desktop ES](distribution-phase21-evidence/desktop-central-es.png)
- [Central mobile ES](distribution-phase21-evidence/mobile-central-es.png)
- [Detalhe mobile ES](distribution-phase21-evidence/mobile-load-es.png)
- [Romaneio no navegador](distribution-phase21-evidence/desktop-document.png)
- [PDV antes da liquidação](distribution-phase21-evidence/pdv-before-settlement.png)
- [Comprovante do PDV existente](distribution-phase21-evidence/pdv-settled.png)
- [PDF original](distribution-phase21-evidence/romaneio-v1.pdf), [segunda via A4 renderizada pelo Chromium](distribution-phase21-evidence/romaneio-print.pdf), [PDF de 9 páginas](distribution-phase21-evidence/romaneio-multipage.pdf)
- [Cenários do navegador](distribution-phase21-evidence/browser-evidence.json), [integridade após PDV real](distribution-phase21-evidence/browser-integrity.json), [integridade das corridas](distribution-phase21-evidence/integrity.json)

No navegador: login da empresa e operador → seleção de dois pedidos → carga → reserva → separação → conferência → aprovação → romaneios v1/v2 → reconsulta da v1 imutável → expedição → resgate no PDV existente → pagamento PYG → comprovante → verificação direta no emulador. Estoque 100 → 90 após expedir 10; pagamento não altera 90; reserva zero; O001 mantém vendedor/cliente e PYG 199.950; um lançamento de equivalente BRL 150 conforme câmbio congelado. Moedas nativas e taxas permanecem no registro. Nenhum valor de moedas distintas é somado como se fossem a mesma moeda.

O host `pdv-distribution-homologacao.html` monta o componente PDV existente com o escritor e os dados sintéticos reais do emulador; é somente um instrumento de teste, excluído do build de produção. O Chromium foi executado em microVM temporária compatível, sem deploy do ZenOS. Impressão validada pela renderização do documento isolado; impressora física não foi testada.

## Arquivos e reprodução

Principais alterações: `settlement.js`, serviço/servidor de Distribuição, `pdvGateway.js`, `operationalV2.js`, `PDV.jsx`, acesso em `App.jsx`, Central/CSS/i18n, regras/configuração V2 de emulador, fixtures/testes, runners de concorrência/navegador, host de homologação, workflow e scripts npm. A lista exata está no diff do commit desta entrega.

```sh
npm ci
npm ci --prefix operational-functions
npm run distribution:test
npm run distribution:homologate
npm run distribution:concurrency
npm run build
# Chromium/Playwright e Java 21 necessários para a suíte visual:
# instalar Playwright somente no ambiente de QA e executar:
npm run distribution:browser
```

## Pendências e entrada na Fase 3

A Fase 2.1 está validada no escopo sintético descrito. A entrada em produção continua bloqueada: requer revisão da política efetivamente instalada, transporte confiável da habilitação pelo Control Center, revisão de segurança do endpoint fora do emulador e autorização expressa. O servidor desta entrega permanece restrito à homologação local. Não há integração ativa entre empresas.

A Fase 3 pode iniciar na branch isolada com critérios explícitos para entregas/retornos, prova de entrega e operação offline do motorista, cancelamentos e compensações após liquidação, além da futura integração Connect. Cobrança parcial por entrega e impressoras físicas exigem homologação específica. Nenhum desses itens foi declarado concluído nesta entrega.

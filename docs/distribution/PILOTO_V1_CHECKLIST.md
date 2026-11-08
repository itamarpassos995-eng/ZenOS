# Piloto V1 — inventário de aceite

| ID | Etapa | O que falta | Bloqueante? | Esforço estimado | Arquivos envolvidos | Critério de aceite |
|---|---|---|---|---|---|---|
| P01 | Entrada, empresa e permissões | Confirmar ambiente isolado, Auth e perfis | BLOQUEANTE | 3–6 h | distribution-homologacao.html, server.js, security.js | Empresa do UID e operador validados no servidor |
| P02 | Pedidos, clientes e carga | Provar três clientes com produtos compartilhados | BLOQUEANTE | 4–8 h | service.js, trip-fixture.mjs | Pedidos e clientes persistidos corretamente |
| P03 | Romaneio, conferência e expedição | Cruzar IDs e quantidades com a viagem | BLOQUEANTE | 2–4 h | domain.js, service.js, pdf.js | Mesmas linhas no documento e na viagem |
| P04 | Motorista, início e paradas | Verificar acesso e navegação móvel | BLOQUEANTE | 3–6 h | DistributionTrips.jsx, DistributionTrips.css | Motorista atribuído consegue operar as paradas no celular |
| P05 | Entrega integral, parcial, recusa e avaria | Executar na mesma viagem | BLOQUEANTE | 3–5 h | trips.js, b4-operator-matrix.test.mjs | Quantidades persistidas e avaria em quarentena |
| P06 | Dinheiro, fiado e parcelas | Restringir perfil e provar vínculo nativo | BLOQUEANTE | 4–8 h | trips.js, phase31CreditAllocation.js | Dinheiro BRL com parcela e recibo nativo |
| P07 | Retorno, conferência, acerto e encerramento | Provar fechamento físico com pendência comercial | BLOQUEANTE | 2–5 h | trips.js, DistributionTrips.jsx | Retorno e acerto preservam a pendência |
| P08 | Histórico e reimpressão | Conferir documento após nova leitura | BLOQUEANTE | 2–4 h | trips.js, DistributionTrips.jsx | Revisões consultáveis e imprimíveis |
| P09 | Coerência e acabamento | Remover amostras conflitantes e harmonizar controles | BLOQUEANTE | 2–5 h | distribution-demo.html, DistributionTrips.css | Mesmo produto por ID e controles utilizáveis |
| P10 | Persistência, isolamento e concorrência | Executar provas de leitura, repetição e tenant | BLOQUEANTE | 3–6 h | b4-operator-matrix.test.mjs, workflows | Uma baixa, um recibo e isolamento comprovados |
| P11 | Staging e acesso | Disponibilizar backend, Firebase e autenticação isolados | BLOQUEANTE | 6–12 h após provisionamento | server.js, security.js, configuração Vercel | Aplicação real acessível por usuário autorizado |
| P12 | País e moeda | Confirmar perfil do cliente | DEPENDE DE DECISÃO | 1–2 h para BRL, PYG requer homologação própria | distribution_config/module, DECISOES.md | País e moeda confirmados e perfil habilitado |
| P13 | Demo visual | Alinhar dados sintéticos ao mesmo roteiro | NÃO BLOQUEANTE | 1–3 h | distribution-demo.html | Amostra coerente e identificada |
| P14 | Cheques, compensações, fiscal e banco | Manter segregados do piloto | FORA DO ESCOPO | — | trips.js, phase31CGates.js | Sem liquidação ou autorização artificial |

# Validação da etapa inicial — 2026-11-04

**Implementação integral incompleta. Não mesclar, publicar ou interpretar este relatório como homologação do ZenOS multimoeda.**

## O que foi implementado

Núcleo decimal exato, contratos puros de domínio e diagnóstico/simulação do legado. Produtos e PDV agora usam os módulos novos somente quando recebem o contexto da homologação estática. O App oficial permanece sem ativação. Nenhum preço, custo, dívida ou documento real foi modificado. A ordem de implementação integral foi preservada no repositório.

## Verificações executadas localmente

| Verificação | Resultado | Limite da evidência |
|---|---|---|
| `money-v2.test.mjs`, `money-operations.test.mjs`, `money-deployment-fence.test.mjs` | 20 testes aprovados | Núcleo e contratos puros; sem fluxo de UI/Firestore V2 monetário |
| Testes selecionados de preferência, cartões, histórico nativo, fechamento e custos de compra | 17 testes/grupos aprovados | Misturam testes comportamentais e checagens estáticas legadas |
| `node scripts/release-check.mjs` | Aprovado, incluindo 15 testes de interface em 5 arquivos | Regressão da suíte existente; não cobre integração multimoeda nova |
| `npm run build` | Aprovado | Build local; aviso existente de chunks grandes |
| `firebase-tools@15.30.2 emulators:exec --only auth,firestore --project demo-zenos-local "node scripts/release-check.mjs --emulator"` | Aprovado | Suíte existente de fiado/V2, livro entre terminais, backup/restauração e concorrência; não cobre novos contratos integrados |
| `git diff --check` | Aprovado | Consistência de whitespace |

O primeiro início dos emuladores falhou porque o Java disponível era 17. Foi preparado um JRE Temurin 21.0.13 em diretório temporário, e a suíte foi executada novamente com sucesso. A suíte em Node emitiu avisos existentes de `localStorage is not defined` em métricas; as verificações e o processo concluíram com código 0. Não alterar a infraestrutura ou esconder esses avisos foi necessário para executar os testes.

O projeto usado foi exclusivamente `demo-zenos-local`, com Auth `127.0.0.1:9099` e Firestore `127.0.0.1:8080`. Nenhuma regra foi publicada. Os módulos novos não importam transportes.

## Critérios da ordem integral

| Critérios | Cobertura disponível | Situação operacional |
|---|---|---|
| 1–7: cadastro, edição, visualização, preferência, câmbio e moeda de preço | Núcleo e teste de interface de Produtos aprovados na homologação estática | Integração com backend e alteração explícita da moeda de precificação pendentes |
| 8–11: compra USD, venda PYG, pagamentos mistos, cartão e troco | Snapshots, custo USD→PYG, parcelas BRL/PYG e contas distintas testados no domínio | Fluxo completo pendente |
| 12–13: caixa por moeda e disponibilidade nativa | Agregação por conta/moeda e retirada insuficiente testadas no domínio; regressão do caixa existente aprovada | Integração monetária nova pendente |
| 14–15: fiado e contas | Saldo residual em moeda contratada testado no domínio; regressão V2 existente aprovada no emulador | Novas obrigações persistidas pendentes |
| 16: recorrências | Sem implementação nova | Pendente |
| 17–18: devoluções e cancelamentos | Sem implementação nova | Pendente |
| 19–20: fracionados, rateio, CMV e lucro | Domínio exato, resíduos, CMV e lucro congelados testados | Integração persistente e devoluções pendentes |
| 21: comissões, metas e bônus | Sem integração nova | Pendente |
| 22: Commerce | Contrato genérico de pedido comercial; sem conexão ao Commerce | Pendente |
| 23: fiscal | Sem integração nova | Pendente |
| 24: recibos e PDFs | Snapshot serializável; sem renderização ou integração nova | Pendente |
| 25–26: importações, exportações, atalhos e IA | Sem integração nova | Pendente |
| 27–29: legado BRL/PYG/ambíguo | Evidência vinculada ao registro/campo/valor e recusa de inferência testadas | Aplicador confiável e UI de revisão pendentes |
| 30–31: cotações inválidas e separadores | Testes do núcleo aprovados | Validação nas interfaces pendente |
| 32: dois terminais | Suíte existente no emulador aprovada; simulação nova rejeita hash divergente | Integração monetária nova pendente |
| 33–34: offline e clientes antigos | Sem proteção monetária nova na fronteira confiável | Pendente |
| 35: reenvio | Idempotência da simulação e suíte existente validadas | Idempotência transacional dos novos contratos pendente |
| 36–37: empresas e permissões | Simulação rejeita empresa diferente; não comprova autorização de backend | Pendente |
| 38–39: regressões BRL, estoque e sincronização | Suíte existente aprovada | Repetir após integrar consumidores |
| 40: leituras/listeners | Núcleo sem I/O verificável por inspeção | Medição por fluxo integrado pendente |
| 41: precisão e limites | Testes de valores altos, fracionados, limites e resíduos aprovados | Testes em todos os consumidores pendentes |
| 42: reversão compatível | Estratégia documentada; novos contratos inativos | Execução da reversão integrada pendente |

## Disponibilidade

Branch remota `feat/multimoeda-integral-homologacao`, PR em rascunho #169. A publicação Vercel desta branch é bloqueada pelo build enquanto o isolamento remoto dos serviços não for comprovado. Existe um build estático isolado para testar Produtos/PDV com dados fictícios locais. O endereço verificado será registrado no PR. Não é a versão operacional completa e não deve ser usado com conta de cliente ou no sistema oficial.

## Próximo trabalho necessário

Integrar a arquitetura nos consumidores existentes e na persistência, concluir proteção confiável de versões, validar Commerce/fiscal/documentos/recorrências/devoluções/comissões/IA e executar os critérios ponta a ponta. O inventário estático não substitui essa implementação. Não declarar o problema de produção resolvido por esta etapa.

## Integração estática de teste

Foram adicionados seis testes de adaptador/transporte local (preço nativo, câmbio, pagamentos mistos, concorrência entre abas, idempotência, falha de quota, preservação do legado e PDF) e dois testes de interface executando os componentes originais de Produtos e PDV. Os testes de interface cobrem salvar/reabrir Gs. 39.990, mudança de preferência sem reinterpretação, venda com baixa de estoque e snapshot preservado após alteração de câmbio. Total da nova base: 26 testes Node e 2 testes de interface, além da suíte de regressão existente.

A homologação local não comprova regras de segurança, persistência Firestore, autenticação, dispositivos remotos, fiscal, Commerce, fiado, recorrências, comissões ou devoluções. Nenhum dado real foi importado. Consulte TESTE_MANUAL.md para o escopo disponível e os passos de teste.

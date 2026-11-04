# Multimoeda integral — contrato e transição

Estado: implementação inicial de contratos. Não habilitado nos fluxos operacionais e não homologado integralmente. NÃO MESCLAR.

A especificação integral aprovada está em [ORDEM_IMPLEMENTACAO.md](ORDEM_IMPLEMENTACAO.md). Nenhum requisito é removido por este documento. A matriz de triagem dos consumidores está em [INVENTARIO.md](INVENTARIO.md).

## Origem e escopo

- Base: `db8b32d00b2b4f662d601a05efcb3da8f166c9ae`.
- Branch: `feat/multimoeda-integral-homologacao`.
- Nenhuma alteração de dados, regra, índice ou configuração de produção.
- Nenhuma migração automática, leitura Firestore ou listener nos módulos novos.
- O código operacional legado ainda mantém seu comportamento. Não confundir este estado com correção publicada do incidente de preços.

## Contrato persistido

```json
{
  "schemaVersion": 2,
  "amount": "39990",
  "currency": "PYG",
  "source": "product:synthetic:price-revision:1"
}
```

`amount` é decimal canônico em texto, sem agrupamento e sem notação exponencial. Texto evita perda de precisão no transporte e armazenamento. `BigInt` é usado apenas internamente, nunca enviado ao Firestore. Limites: 60 dígitos e 18 casas decimais por valor; cálculos de multiplicação e conversão usam por padrão 8 casas, com política explícita de arredondamento. Esses padrões devem ser revistos com cada consumidor antes da integração.

Não trocar a interpretação dos campos legados `*BRL`. O contrato nativo será a fonte de verdade de registros V2; projeções de compatibilidade só poderão ser derivadas com moeda, cotação e revisão, nunca editadas independentemente. Essa projeção AINDA NÃO ESTÁ IMPLEMENTADA e a ativação operacional permanece pendente.

Valores sem evidência suficiente permanecem legados, sem moeda original inferida. IDs, SKU, quantidades e percentuais não são objetos monetários.

## Núcleo implementado

`src/core/money.js`:

- Validação estrita do contrato, moeda, origem e limites.
- Soma, subtração, comparação e multiplicação com inteiros escalados.
- Parser de entrada com idioma explícito e validação de grupos.
- Formatação sem câmbio e sem converter o inteiro grande para `Number`.
- Conversão com par, taxa, identidade, validade temporal, data de aplicação e finalidade explícitos.
- Snapshot congelado da conversão, produto decimal exato e resíduo de arredondamento.
- Quantização HALF_UP, HALF_EVEN e DOWN; rateio por maiores resíduos com desempate estável.

Uma cotação tem direção `from -> to`, com `rate` em unidades de destino por unidade de origem. A taxa não é inferida de país, preferência ou sufixo. Não há fallback para 1. Conversão na mesma moeda mantém identidade e dispensa cotação.

`parseMoneyInput` recebe o idioma da entrada, não o deduz da moeda. Em `es-PY`/`pt-BR`, `39.990` significa 39990; em `en-US`, 39.990 significa 39.99. Sem idioma, a entrada é rejeitada. Formato incompatível com o idioma também é rejeitado. Textos digitados e decimais canônicos são contratos distintos.

## Operações de domínio implementadas

`src/core/moneyOperations.js` fornece funções puras para:

- Livro de preços com moedas independentes para custo, venda e tabelas adicionais.
- Mudança explícita de precificação com revisão, operador, motivo e antes/depois.
- Snapshot comercial de venda, compra, orçamento, pré-pedido e pedido online.
- Custo original, preço original, preço/custo convertidos e totais por item.
- Quantidades fracionadas, desconto e acréscimo na moeda comercial.
- CMV e resultado congelados no snapshot.
- Reconciliação de pagamentos e troco, preservando método, conta e moeda original.
- Saldo residual na moeda contratada.
- Saldos nativos separados por conta e moeda; retirada restrita à disponibilidade nativa.
- Agregação de relatórios por moeda, sem total misto.

Essas funções NÃO são um novo PDV, um novo livro persistente ou um painel paralelo. São contratos para adaptar os módulos existentes. Produtos e PDV agora podem usar esses contratos por um contexto opt-in, ativado apenas na homologação estática com dados fictícios. O App oficial não ativa esse contexto. Testes de domínio não comprovam persistência, segurança de backend, idempotência transacional ou integração das interfaces.

Política inicial: quantidade multiplicada por preço unitário é calculada com precisão intermediária de 8 casas; total de cada linha e CMV da linha são arredondados na precisão da moeda, com resíduo separado; total comercial soma linhas e ajustes, com arredondamento final explícito. Compatibilidade com políticas de rateio, tributação e devolução do sistema existente deve ser validada antes da ativação.

## Legado e correção

`src/core/moneyLegacy.js` não faz I/O:

1. Classifica contrato nativo válido, nativo inválido, legado comprovado, comprovadamente afetado ou pendente de revisão.
2. Evidência deve identificar registro, campo, valor observado, moeda, quantia canônica, tipo e referência.
3. País, idioma, preferência, magnitude, forma de pagamento e nome `*BRL` não são provas.
4. Produz plano com cópia do antes/depois e SHA-256.
5. Simulação rejeita alteração concorrente, empresa diferente, plano modificado e reutilização de chave com outro resultado.
6. Simulação não modifica os campos legados nem constitui autorização de gravação.

Evidência fornecida ao módulo puro não é automaticamente confiável. O aplicador futuro precisa verificar autoria/permissão/referência em ambiente confiável e conferir hash + escrita + auditoria + chave idempotente na mesma transação. Não existe aplicador real nesta etapa. Não executar esses planos nos consumidores BRL enquanto a projeção e as guardas de versão não existirem.

## Fronteiras ainda necessárias

Antes de ativar qualquer registro monetário V2:

- Integrar todos os leitores e gravadores do inventário, incluindo atalhos e backends.
- Definir e testar projeções BRL compatíveis sem duas fontes de verdade.
- Integrar snapshots comerciais e obrigações na persistência existente.
- Validar pagamentos mistos, troco, fechamento e diferença cambial no fluxo real.
- Integrar devoluções proporcionais, comissões, rateios, recorrências e contas.
- Adaptar Commerce e seus contratos cliente/servidor sem antecipar gravações operacionais.
- Adaptar fiscal, impressão, PDF e compartilhamento.
- Adicionar guardas de versão em fronteira confiável que também impeçam terminais antigos de gravar incompatibilidades.
- Validar offline, duas sessões concorrentes, idempotência e reversão compatível.
- Confirmar moedas e políticas sem inferência automática sobre dados reais.
- Validar interfaces PT/ES/EN e preservar permissões.

## Isolamento

O modo local existente usa Firebase `demo-zenos-local` e emuladores. Os contratos novos não importam Firebase, APIs, armazenamento, navegador, configuração da empresa ou transportes.

`scripts/money-deployment-fence.mjs` é carregado pelo Vite e bloqueia builds em Vercel nesta branch experimental. Motivo: um preview pode herdar credenciais e rotas Commerce/Blob de produção, mesmo com Firebase do frontend isolado. O bloqueio não comprova isolamento de todos os transportes de uma futura homologação. Não remover antes dessa verificação. Não usar build precompilado para contornar a proteção.

O bloqueio também impede publicação desta branch em produção. É temporário e NÃO deve ser mesclado inadvertidamente.

## Reversão

Como não há ativação operacional nem gravação V2, a base nova pode permanecer inativa sem transformar dados existentes. Depois da integração, reversão exigirá leitor compatível, bloqueio de gravadores antigos, tratamento das filas offline e preservação de todos os eventos novos. Restaurar backup antigo sobre dados recentes não é uma estratégia válida.

## Economia de leituras

Os módulos novos são funções locais e não executam leituras ou gravações. Isso é verificável por inspeção das dependências. Não representa uma medição de consumo do aplicativo integral após futura integração. O orçamento de leituras e gravações deve ser medido no emulador por fluxo.

## Homologação

Executar:

```bash
node --test scripts/money-v2.test.mjs scripts/money-operations.test.mjs scripts/money-deployment-fence.test.mjs
node scripts/release-check.mjs
npm run build
```

Esses comandos não ativam a arquitetura no App oficial. Cadastro, edição, venda à vista/cartão e comprovantes estão disponíveis na homologação estática descrita em TESTE_MANUAL.md. Os demais módulos e a persistência de backend continuam pendentes; os 42 critérios não estão integralmente homologados.

## Homologação estática de Produtos/PDV

O build `build:money-test` possui entrada restrita em `homologacao/`, sem App/login e sem APIs. Reutiliza os componentes de Produtos e PDV com adaptador local versionado. Substitui Firebase/runtime por módulo sem transportes, usa CSP connect-src none e só inclui a logo original entre os arquivos públicos. Não remover a proteção do build comum da branch; o preview isolado usa somente essa entrada revisada. Instruções e limitações em TESTE_MANUAL.md.

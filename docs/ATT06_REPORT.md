# RELATÓRIO DA ATT 06

## 1. ATT
ATT: 06
Nome: Movimentação de Estoque Auditável
Objetivo: tornar Vitrine e Depósito auditáveis, registrar movimentações por produto e alertar o PDV quando a venda consumir somente estoque de vitrine.
Status: CÓDIGO CONCLUÍDO / TESTES LÓGICOS E SINTÁTICOS APROVADOS / BUILD WINDOWS PENDENTE

## 2. PROBLEMA CORRIGIDO
A grade de produtos possuía controle rápido apenas da vitrine e permitia alteração de saldo sem motivo, operador ou histórico. O depósito era apenas informativo. Além disso, vendas, compras e devoluções alteravam estoque sem uma trilha específica por produto.

A ATT 06 cria uma operação auditável para transferências Vitrine ↔ Depósito e uma trilha separada para novas movimentações de estoque. O histórico é exibido dentro da edição do produto, abaixo da gaveta fiscal, mas não é embutido no array de produtos da V1 para evitar crescimento do documento único `dados/operacao`.

## 3. ARQUIVOS ALTERADOS
- `src/App.jsx`
  - passa `userId`, operador e plano da loja aos módulos de estoque;
  - lê `plano`/`planoId` quando já existir no documento raiz da loja;
  - mantém `basico` como fallback compatível quando o campo não existe.
- `src/core/inventory.js`
  - adiciona transferência segura entre Vitrine e Depósito;
  - mantém os contratos antigos de ATT 02 intactos;
  - expõe dados antes/depois em campo de auditoria separado.
- `src/components/Produtos.jsx`
  - controles +/- independentes para Vitrine e Depósito;
  - modal obrigatório de motivo para transferências;
  - estoque de produto já cadastrado deixa de ser editável diretamente pelo formulário;
  - gaveta de histórico abaixo da seção fiscal;
  - filtro de datas e janela por plano;
  - saldo inicial de novos produtos passa a ser registrado no histórico.
- `src/components/PDV.jsx`
  - aviso quando o produto só possui saldo na vitrine;
  - bloqueio antecipado de quantidade acima do estoque total;
  - vendas novas registram movimento auditável por produto.
- `src/components/PDVCompras.jsx`
  - entradas de compra registram movimento para o Depósito.
- `src/components/Vendas.jsx`
  - devoluções registram movimento de reposição por produto.
- `package.json`
  - adiciona `test:att06`.

## 4. ARQUIVOS CRIADOS
- `src/core/stockAuditCore.js`
- `src/core/stockAudit.js`
- `scripts/att06-check.mjs`
- `docs/ATT06_REPORT.md`

## 5. ARQUIVOS REMOVIDOS
Nenhum.

## 6. BANCO DE DADOS
Banco de produção alterado: NÃO
Dados existentes modificados: NÃO
Dados existentes excluídos: NÃO
IDs existentes alterados: NÃO
Migração executada: NÃO
Estrutura V2 criada: NÃO
Estrutura nova prevista para auditoria: SIM — aditiva, sem migração.

Caminho novo usado somente por novas movimentações quando a versão for executada:
`lojas/{uid}/estoque_auditoria/{produtoId}/movimentos/{movimentoId}`

Nenhum documento foi criado no Firebase real durante esta ATT.

## 7. IMPACTO NOS DADOS DO CLIENTE
Produtos existentes: NÃO MIGRADOS / NÃO RECRIADOS
Clientes existentes: NÃO ALTERADOS
Vendas existentes: NÃO ALTERADAS
Estoques existentes: NÃO ALTERADOS AUTOMATICAMENTE
Financeiro existente: NÃO ALTERADO
Históricos existentes: NÃO ALTERADOS
Configurações existentes: NÃO ALTERADAS

Movimentações antigas de estoque não são inventadas retroativamente. A trilha começa a partir das novas ações executadas com a ATT 06.

## 8. COMPATIBILIDADE
Compatível com V1: SIM
Fallback V1 preservado: SIM
Rollback possível: SIM
Contratos da ATT 02 preservados: SIM

## 9. COMO FUNCIONAVA ANTES
- Vitrine tinha +/- sem motivo obrigatório.
- Depósito não possuía os mesmos controles.
- Alterações manuais não deixavam trilha por produto.
- Venda/compra/devolução não apareciam num histórico específico do produto.
- Um produto somente na vitrine era vendido corretamente pela regra de estoque, mas sem aviso claro ao vendedor.

## 10. COMO FUNCIONA AGORA
- Vitrine + transfere Depósito → Vitrine.
- Vitrine - transfere Vitrine → Depósito.
- Depósito + transfere Vitrine → Depósito.
- Depósito - transfere Depósito → Vitrine.
- Toda transferência exige motivo e pode receber observação.
- A origem não pode ficar negativa.
- O total do produto não muda em transferências internas.
- Venda, compra e devolução passam a produzir eventos de histórico.
- O histórico fica na edição do produto, abaixo da gaveta fiscal.
- A janela consultável depende do plano: Básico 30 dias, Essencial 90 dias, Pro 365 dias e Multi-Filiais 3650 dias.
- A ATT 06 NÃO apaga fisicamente dados antigos por plano. A política limita consulta/leitura; TTL/arquivamento destrutivo ficou propositalmente fora desta atualização.

## 11. EXEMPLO PRÁTICO
ANTES:
Vitrine: 5
Depósito: 0
Venda: 1
Resultado: Vitrine 4 / Depósito 0, porém sem alerta e sem trilha específica do produto.

AGORA:
PDV mostra: “Este produto só possui 5 unidades disponíveis na vitrine”.
Venda: 1
Resultado: Vitrine 4 / Depósito 0 / Total 4.
Histórico do produto registra venda, operador, horário, referência da venda e saldo antes/depois.

Transferência manual:
Vitrine 4 / Depósito 10 / Total 14
Clique `+` na Vitrine, quantidade 3, motivo “Reposição da vitrine”.
Resultado: Vitrine 7 / Depósito 7 / Total 14.
Histórico registra a transferência.

## 12. TESTES EXECUTADOS
[OK] ATT 01 — 21 verificações
[OK] ATT 01.1 — 16 verificações
[OK] ATT 02 — 10 grupos
[OK] ATT 03 — 21 verificações
[OK] ATT 04 — 24 verificações
[OK] ATT 06 — 18 verificações
[OK] Parser sintático JSX/JS em todos os arquivos modificados
[OK] transferência Depósito → Vitrine
[OK] transferência Vitrine → Depósito
[OK] bloqueio de saldo local insuficiente
[OK] total preservado em transferência interna
[OK] evento contém operador, motivo e antes/depois
[OK] histórico separado do documento `dados/operacao`
[OK] venda registra auditoria
[OK] compra registra auditoria
[OK] devolução registra auditoria
[OK] aviso de estoque somente na vitrine
[OK] filtros de histórico por data
[OK] janela de histórico por plano

## 13. TESTES NÃO EXECUTADOS
Build Vite completo no container: NÃO CONCLUÍDO.
Motivo: `npm ci` excedeu o tempo do ambiente antes de instalar o Vite.
Build no Windows do usuário: PENDENTE.
Teste visual/funcional no Firebase Emulator: PENDENTE.
Firebase real: NÃO ACESSADO.
Produção real: NÃO TESTADA.

## 14. RISCOS RESTANTES
1. As regras reais do Firestore não estão no pacote auditado. A nova coleção `estoque_auditoria` precisa ser autorizada pelas regras reais antes de deploy em produção.
2. Na V1, estoque e evento de auditoria ainda não estão em uma única transação Firestore atômica porque o estoque principal continua dentro do documento-array legado. A V2 deverá resolver a atomicidade definitiva.
3. A janela por plano reduz leituras e limita o histórico consultável, mas não executa exclusão física/TTL. Isso foi deliberadamente evitado para não introduzir apagamento automático antes do motor de planos/arquivamento estar definido.
4. Movimentações anteriores à ATT 06 não podem ser reconstruídas com segurança e não são inventadas.

## 15. PRÓXIMA ATT RECOMENDADA
Validar a ATT 06 em homologação nos cenários de transferência, venda somente de vitrine, compra, devolução e histórico por produto.
Após a validação, seguir para ATT 05 — Livro Financeiro + Painel de Turnos de Caixa, conforme a prioridade do projeto, ou para o motor de comissão quando autorizado.

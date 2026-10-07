# ATT 06.2 — Operação Multiusuário, Voucher e Identidade da Loja

## Status
Implementação cirúrgica sobre a ATT 06.1. Nenhuma migração V2 executada e nenhum banco de produção acessado.

## Entregas
- Listener Firestore em tempo real do documento operacional e das configurações da loja.
- Índice atômico auxiliar de unicidade de produto por SKU e assinatura lógica (nome/marca/unidade).
- Bloqueio de duplicidade antes do cadastro no catálogo e no cadastro rápido do PDV.
- Inativação segura de produtos com histórico; exclusão física somente para cadastro sem uso e mediante senha gerencial.
- Modal visual ZenOS reutilizável, aplicado ao alerta de vitrine e ao voucher.
- Voucher apresentado em modal próprio, registrado no V1 com saldo/status e aceito no PDV por código, com consumo parcial ou total.
- Edição rápida de nome/logo da loja no menu lateral.
- Configurações ampliadas de impressão: 58 mm, 80 mm ou A4, cabeçalho, rodapé, logo, endereço e telefone.
- Cupom do PDV e reimpressão passam a usar identidade configurada da loja.

## Limite conhecido do V1
O listener em tempo real reduz o atraso entre terminais, mas o V1 ainda grava arrays completos. Alterações simultâneas extremas no mesmo campo continuam sendo risco estrutural até a V2. A criação de produtos recebeu trava atômica específica para eliminar a principal corrida de duplicidade.

## Produção
Banco real alterado: NÃO. Dados existentes excluídos: NÃO. IDs existentes migrados: NÃO. V2 iniciada: NÃO.

## Antes de produção
Auditar regras Firestore reais para permitir apenas a própria loja em `produto_indices` e `dados/configuracoes`.

---

## Correção de integração da própria ATT 06.2

Durante o primeiro teste manual da ATT 06.2 foram identificados três pontos de integração incompletos:

1. `Vendas.jsx` ainda utilizava `window.confirm()` para confirmação do estorno.
2. O componente `ZenModal` era importado e recebia estado, mas não estava montado na árvore JSX de `Vendas.jsx`, portanto o modal de sucesso do voucher não aparecia.
3. O voucher era persistido no estado V1, mas não existia interface de consulta para localizar códigos, saldo e origem.

Correções aplicadas sem criar nova ATT:

- confirmação de estorno agora usa `ZenModal` próprio do ZenOS;
- alerta de venda que usa vitrine também usa `ZenModal`, eliminando a janela branca do navegador nesse fluxo;
- `ZenModal` foi efetivamente montado em `Vendas.jsx`;
- foi criada a `Central de Vouchers` no Histórico de Vendas;
- venda expandida exibe devoluções e respectivos códigos de voucher;
- vouchers exibem código, saldo, valor original, status, venda de origem, operador e data;
- testes ATT 06 e 06.1 foram atualizados apenas para reconhecer o novo texto do modal, sem alterar regra de negócio;
- teste ATT 06.2 passou de 19 para 24 verificações, cobrindo a integração visual e operacional.

Banco real acessado: NÃO.
Dados reais alterados: NÃO.
Migração executada: NÃO.

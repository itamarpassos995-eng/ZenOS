# Continuidade Commerce — divisão de trabalho

Repositório: itamarpassos995-eng/ZenOS. PR #30 (draft). Branch: feat/commerce-studio-galeria-p2-homologacao-20261016. Nunca usar zenos-ac6b2 em testes; homologação exclusiva zenos-commerce-homologacao. Preservar Share V2 e todos os dados/regras operacionais. Ler AGENTS.md e estado atual do PR antes de editar. Não trabalhar em paralelo nos mesmos arquivos sem coordenar commits.

## Chat normal — desenvolvimento, com ferramentas compatíveis ou arquivos atuais

- Aba Loja online no cadastro existente, habilitada por licença e autorização de servidor: descrição comercial, capa original, oito fotos extras, categorias e preço online independente. Promoção de/por com validade e faixas por quantidade, validadas no servidor. Não alterar custo, histórico ou preço do PDV implicitamente.
- Central de pedidos integrada ao ZenOS: contador e aviso de novo pedido, atualização automática enquanto o sistema está aberto e indicador de falha de conexão. Notificação do navegador apenas com consentimento; notificação com app fechado exige infraestrutura própria, não prometer só com polling.
- Abrir no PDV: buscar pedido autorizado no servidor, vincular IDs canônicos dos produtos, carregar cliente/itens/quantidades/preços acordados com origem do pedido. Revalidar estoque, produto ativo, preço e permissões antes de finalizar; divergência exige decisão explícita. Não sobrescrever carrinho existente. Avisar se outro operador estiver atendendo.
- Idempotência servidor: vínculo pedido → venda, impedir faturamento duplicado mesmo com dois operadores; marcar concluído somente após venda persistida. Pedido cancelado/faturado não pode ser importado novamente. Estoque/caixa/comissão/fiscal passam apenas pelo fluxo aprovado de venda, sem lançamentos paralelos.
- Status: recebido → em atendimento → venda concluída / cancelado. Separar entrega do pagamento quando necessário. WhatsApp complementa o pedido persistido.
- Layout, textos, catálogo, testes locais e revisão de código também podem ser feitos no chat normal conforme as ferramentas disponíveis. Não há exigência técnica de Work para escrever código.

## Work — manter esta homologação e os acessos conectados

- Autenticação/autorização administrativa do provedor, IAM e configuração isolada de Firebase; usuário faz login sem expor códigos/senhas no chat.
- Testes no ambiente real: Storage privado, capa/miniaturas/galeria/banners, renovação e expiração de URLs, persistência após recarregar, duas lojas e revogação de operador.
- Navegador autenticado quando disponível, notificações, pedido e verificação de integração após os commits do outro chat. Publicação/merge só após gates e autorização aplicável. Work não concede automaticamente credenciais nem substitui a necessidade de ferramentas adequadas.

## Evidência atual

Proprietário confirmou upload após ajuste IAM e envio de pedido pelo WhatsApp; print mostra pedido recebido BE322277A4, R$29,90. Ainda confirmar a listagem administrativa desse pedido no sistema. Rolagem pública testada no navegador. Expiração real GCS, toque/mobile e configuração autenticada ainda não aprovados pelo agente.

Banners: upload desconectado e prévia presa ao primeiro banner corrigidos no código. Destino privado por loja/banner e desktop/mobile; referências persistentes sem guardar URL assinada; hidratação ao consultar catálogo e configuração. Validar na nuvem após deploy isolado.

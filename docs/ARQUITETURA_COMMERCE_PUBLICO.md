# ZenOS Commerce — vitrine CDN, primeira etapa de homologação

## Decisão técnica
Manter o **Firestore como fonte oficial** e o **PDV integralmente intacto**. Publicar catálogo mínimo e imagens numa **Vercel Blob pública**, servido pela CDN. A rota /loja/{apelido} não deve depender de Firebase Authentication. **Visitas e pesquisas no catálogo não devem consultar o Firestore**. Pedidos usarão uma API Node no servidor com validação e idempotência.

## Limites de segurança e custos
- Nenhuma alteração do arquivo src/firebase.js, cache offline, listeners, sistema de estoque, regras de Firestore ou PDV.
- Snapshot deve ser produzido **pelo servidor**, a partir dos documentos oficiais e depois de validar o token do lojista. Não publicar payload vindo diretamente do navegador.
- Leituras Firestore pontuais **somente na publicação** e na confirmação de compra; não consultar Firestore por visita. Fotos/JSON versionados (caching imutável); aliases de slug são resolvidos por objetos públicos cacheados, sem query a banco.
- O contrato criarSnapshotCommercePublico expõe somente informações intencionalmente públicas, sem custo, financeiro, dados de clientes, credenciais ou histórico.
- Checkout API: validar preço/estoque do servidor, rate limit, antiabuso, idempotência de tentativa, contornar reenvios e **não retornar sucesso se o pedido não chegou ao PDV**.
- Não colocar credenciais Firebase Admin nem token de Blob no frontend; manter segredos em Vercel com menor privilégio possível.
- Evitar publicação em cada alteração de estoque: usar controle de frequência e estratégia de indisponibilidade; verificar preço/estoque oficiais na confirmação.

## Etapas obrigatórias
1. **Esta branch:** contrato puro de snapshot e validação, testes sem Firebase. Nenhum endpoint ligado, compra ou deploy de infraestrutura. Não faz publicação automática.
2. **Backend isolado:** conectar Blob pública com variáveis restritas; endpoints autenticados para publicar e não autenticados para ler; versão/cache/alias. A conexão requer homologação de custo e segurança.
3. **Pedidos:** criar API protegida, confirmar dados oficiais com acesso mínimo, gravar idempotentemente pedidos no destino já utilizado pelo PDV e validar todo o fluxo.
4. **Piloto Zênite Atacadão:** testar janela anônima, celular, cache, 1/2/3 fotos, preços, alteração de estoque, escolha de entrega/pagamento, pedidos e WhatsApp. Medir leituras antes/depois.
5. **Liberação gradual:** recurso habilitado por loja somente após testes; sem fallback automático que passe a consultar Firestore a cada visita.

## Condições pendentes
- A Vercel não tinha store Blob conectado ao ZenOS na auditoria de 29/10/2026.
- É necessária auditoria dos acessos de serviço, das regras reais e do fluxo de pedidos.
- Eventual uso e tráfego de Blob/Vercel têm cobrança conforme o plano; acompanhar faturamento.
- O código desta etapa **não ativa a vitrine pública nova** nem remove o acesso atual. Não fazer merge como se já fosse uma solução completa.

## Regra permanente
**Não aumentar leituras, não reinstalar listeners, não modificar a persistência, não expor dados privados e não degradar o PDV.**

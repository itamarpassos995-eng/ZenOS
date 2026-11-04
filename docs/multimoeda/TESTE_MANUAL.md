# Homologação de cadastro e PDV multimoeda

Esta versão reutiliza Produtos, PDV e layout do ZenOS. O transporte de homologação salva dados fictícios somente no navegador, com Web Locks e revisão para detectar conflitos entre abas. Não utiliza autenticação, Firestore, Blob, Commerce, fiscal ou contas reais. Não inserir dados de clientes. O ambiente operacional oficial permanece inalterado.

## Escopo disponível

- Cadastro e edição de produtos com moeda explícita de custo e preço.
- Moeda predeterminada para novos registros, sem reinterpretar cadastros anteriores.
- Exibição de equivalências por câmbio, preservando o valor nativo.
- Tabelas de preço e cadastro rápido pelo PDV.
- Venda à vista/cartão, pagamentos mistos e troco com snapshot monetário.
- Baixa de estoque, histórico local de teste e PDF na moeda original.
- Registro legado fictício ambíguo mantido sem conversão e sem venda automática.

Esta entrega NÃO homologa fiado, contas, compras, fiscal, Commerce, recorrências, comissões, cancelamentos ou devoluções. Não existe proteção de backend/versões antigas sendo validada pelo transporte local. A arquitetura integral e seus 42 critérios permanecem no escopo do PR #169.

## Roteiro principal

1. Abra Produtos & Estoque. A moeda predeterminada inicial é PYG.
2. O produto fictício `MASSA — TESTE 39.990` deve exibir **PYG 39.990**.
3. Clique Editar: o preço deve ser `39990`, com moeda de preço PYG. Salve e reabra.
4. No cabeçalho, escolha BRL. A equivalência inicial é aproximadamente **BRL 173,87**, pois 1 BRL = 230 PYG.
5. Clique Salvar padrão. O produto existente continua precificado originalmente em PYG. Um novo cadastro começa em BRL.
6. Volte para PYG. O produto deve exibir novamente **PYG 39.990**.
7. Pelo botão de câmbio, altere 1 BRL para 460 PYG. O preço original em PYG deve continuar em 39.990; sua equivalência BRL muda.
8. Para cadastrar outro produto em PYG, selecione PYG, salve como padrão e clique Novo Produto. Use nome, SKU e estoque fictícios. `39.990` em PT/ES é interpretado como 39990.
9. Abra PDV Balcão, pesquise o produto e adicione uma unidade. Pressione F10 ou Receber no Caixa.
10. Escolha Guarani ou Cartão Crédito (PYG), lance o pagamento e finalize. Se houver baixa da vitrine, confirme o aviso existente.
11. Consulte Vendas de teste e baixe o PDF. Total, moeda, CMV e resultado são os snapshots da operação.
12. Altere novamente o câmbio depois de concluir/limpar o atendimento. A venda e seu PDF devem manter os valores originais.
13. Atualize a página. Produtos e vendas permanecem neste navegador.

Durante um atendimento pendente, troca de moeda de operação e câmbio são bloqueados nesta versão de homologação. Rascunhos mantêm moeda e taxas para evitar reinterpretação ao recarregar. A preferência de novos cadastros é um conceito separado.

## Executar localmente

```bash
npm ci --ignore-scripts
npm run build:money-test
npx vite preview --config vite.money-test.config.js --host 127.0.0.1 --port 4173
```

Abrir `http://127.0.0.1:4173`. Web Locks exige contexto seguro (HTTPS ou localhost). Dados de navegadores/dispositivos diferentes não são sincronizados. O indicador Offline reforça que não existe conexão de dados com o sistema oficial.

## Isolamento do build de teste

- Entrada própria em `homologacao/index.html`, usando os componentes originais, sem importar App/login.
- `src/firebase` e `runtimeEnvironment` substituídos por módulo sem inicialização de Firebase.
- Não são incluídas rotas de API ou arquivos públicos comerciais.
- Apenas a logo original é copiada sem alteração.
- CSP `connect-src 'none'` bloqueia conexões de rede do aplicativo.
- O build verifica a ausência dos identificadores Firebase de produção nos chunks.
- A publicação comum da branch continua bloqueada. Somente o build estático isolado pode ser usado para esta homologação.

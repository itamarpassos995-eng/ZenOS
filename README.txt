COMO EXECUTAR O ZENOS ZENITE OS NO SEU COMPUTADOR:

1. Descompacte este arquivo ZIP em uma pasta nova (ex: C:\ZenosZeniteOS).
2. Abra o Prompt de Comando (CMD) ou o PowerShell nessa pasta.
3. Certifique-se de ter o Node.js instalado (baixe em nodejs.org se não tiver).
4. Digite o seguinte comando para instalar as dependências:
   npm install
5. Após a instalação, digite o comando para rodar o projeto no navegador:
   npm run dev
6. O terminal vai mostrar um link (ex: http://localhost:5173). Abra no seu navegador e pronto!

FUNDACAO FISCAL - FASE 1 (SEM EMISSAO):

- O PDV registra somente clienteQuerFiscal. Pre-pedidos preservam essa intencao.
- src/core/fiscalCore.js cria snapshots independentes e deriva a fila por loja
  e ambiente. Dados ausentes permanecem nulos e exigem revisao; nao ha aliquotas
  ou recalculo comercial. moedaComercial preserva a moeda explicita da venda/loja;
  quando ausente no legado, permanece nula (nao se deduz pelo pais ou pagamento).
  totaisOriginaisSnapshot copia venda.totaisComerciais quando disponivel.
  valoresGerenciaisSnapshot preserva separadamente os campos legados BRL.
  totaisComerciaisSnapshot identifica explicitamente moeda BRL e semantica
  valores_gerenciais_legados_brl. Nao ha conversao inventada.
  Itens preservam precoTexto apenas como texto legado (sem moeda garantida);
  valoresOriginaisSnapshot copia item.valoresOriginais quando disponivel,
  sem converter precoPraticadoBRL. Valores originais ausentes ficam nulos.
  moedaFiscal preserva a configuracao explicita; sem ela, usa moedaComercial
  ou a referencia BRL/BR e PYG/PY, sempre exigindo revisao antes de emissao.
- src/core/fiscalAdapters.js seleciona BR/PY pelo perfil da loja. Transmissao,
  consulta governamental, cancelamento autorizado e artefatos estao indisponiveis.
- src/core/fiscalGateway.js exige backend seguro; sem ele, retorna erro explicito.
  Nao existe persistencia fiscal real ou fallback local nesta fase.
- src/core/fiscalRepository.js define a reserva transacional por loja, venda,
  tipo e ambiente. A implementacao de transacao e a autorizacao no servidor
  ainda sao obrigatorias antes de integrar com Firestore.
  Todas as leituras/escritas transacionais recebem lojaAutorizada explicitamente.
  fiscalSaleLockKey (loja + venda + ambiente) reserva um tipo principal por venda;
  tipos diferentes conflitam. Documento e trava devem ser gravados atomicamente.
  Esta politica conservadora nao define legislacao nem libera troca automatica.
- Tentativas/revisoes nao mudam a chave. Eventos internos repetidos sao
  deduplicados. Cancelar rascunho nao cancela venda nem documento autorizado.
- O backend futuro deve ler a venda autoritativa e escrever somente no namespace
  fiscal da loja autorizada (ex.: lojas/{lojaId}/fiscal_documents/{id}).
  Chamadas governamentais nunca devem ocorrer no callback da transacao.
- Certificados, senhas e tokens devem ficar em cofre de segredos do backend,
  nunca em frontend, localStorage ou Firestore acessivel ao cliente.
- Nao ha tela/fila fiscal conectada nesta fase. O teste usa armazenamento
  compartilhado somente em memoria para verificar o contrato de concorrencia;
  isso nao substitui testes de backend, regras de acesso ou provedor real.

Validacao da fundacao: npm run test:fiscal

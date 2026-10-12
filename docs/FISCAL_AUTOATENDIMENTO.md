# Configuração fiscal por empresa

## Entrega desta alteração

O cliente escolhe país e documentos, informa o cadastro e acompanha pendências calculadas no backend. `configurar` e `validarConfiguracao` reutilizam a callable `fiscalSolicitacaoCliente`; somente as três Functions do codebase fiscal continuam exportadas.

- O Brasil utiliza cadastro de empresa compatível com a API Focus NFe. O Paraguai mantém seus campos e documento separados.
- Municípios brasileiros são carregados por UF pela API oficial do IBGE, com preenchimento do código municipal. Quando a API não responde, há preenchimento manual e validação do prefixo da UF no servidor.
- Salvar o cadastro dispensa a aprovação manual usada na solicitação anterior. Isso não autoriza emissão.
- A verificação externa exige consentimento explícito e chama exclusivamente `POST /v2/empresas?dry_run=1`. Não cria empresa no provedor, não contrata plano e não emite notas.
- Todas as flags de habilitação de documentos são enviadas como `false`. A resposta pública contém apenas resultado/código da validação; tokens de respostas do provedor não são retornados, persistidos ou registrados.
- A credencial principal deve ficar no Secret Manager, secret `ZENOS_FOCUS_API_TOKEN`. Nenhuma credencial é recebida do navegador ou incluída no bundle.
- O cadastro completo e a validação do provedor NÃO alteram `habilitado:false` ou `emissaoHabilitada:false`.
- A API preserva as ações anteriores `solicitar`/`consultar` e não altera rules, vendas, caixa, estoque ou perfil comercial.

## Dependência externa atual

É necessária uma conta de integração/software house na Focus NFe, com acesso à API de empresas e credencial principal. A assinatura e eventuais custos devem ser escolhidos pelo responsável pelo ZenOS. Contato oficial: https://focusnfe.com.br/contato/.

Para conectar a credencial, salve-a no Secret Manager como `ZENOS_FOCUS_API_TOKEN`, habilite a API Secret Manager e conceda `roles/secretmanager.secretAccessor` apenas nesse secret à service account de runtime de `fiscalSolicitacaoCliente`. Não envie a credencial pelo chat, GitHub ou frontend. A ausência de credencial, falta de acesso ou API desabilitada aparece como pendência, sem ativação fictícia.

## O que ainda falta para emissão real

Esta alteração NÃO conclui o módulo de emissão. Ainda precisam ser implementados e homologados:

1. Provisionamento definitivo de cada empresa no provedor, armazenamento seguro dos tokens individuais e tratamento de repetição/timeout.
2. Envio seguro e validação do certificado A1 e das credenciais específicas; CSC para NFC-e quando aplicável e configuração municipal/nacional de NFS-e conforme cobertura.
3. Cadastro fiscal de produtos/serviços e mapeamento das vendas autoritativas para os payloads legais de cada modelo, sem alterar dados comerciais.
4. Emissão, consulta, cancelamento, XML/representação para impressão e reconciliação oficial, incluindo testes reais de homologação com empresa/credenciais autorizadas.
5. Política comercial e ativação de produção por documento/empresa após a homologação, sem assumir autorização a partir de uma resposta simulada.

Os conectores experimentais de emissão já existentes permanecem exclusivos de homologação e não estão conectados à emissão no PDV.

## Fontes primárias

- https://doc.focusnfe.com.br/reference/criar_empresa
- https://doc.focusnfe.com.br/reference/autenticacao
- https://servicodados.ibge.gov.br/api/docs/localidades

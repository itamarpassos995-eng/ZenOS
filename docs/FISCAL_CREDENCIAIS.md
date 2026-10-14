# Recebimento seguro de credenciais

Depois de salvar o cadastro brasileiro completo, a loja vê a etapa Certificado e credenciais. É possível enviar certificado A1 (.pfx/.p12 até 40 KB) e senha, e, para NFC-e, ID/CSC de homologação ou produção. Campos são limpos após o envio e não usam localStorage. Trocar o ambiente limpa ID/CSC para evitar mistura.

`salvarCredenciais` exige proprietário autenticado, cadastro completo e autorização explícita. Guarda o conteúdo em uma versão de `ZENOS_FISCAL_CREDENTIALS` no Secret Manager. No Firestore ficam referência interna, confirmação de recebimento e consentimento; respostas públicas não contêm segredos nem referência do cofre. Cada versão é vinculada à loja e ao hash da configuração. Alterações concorrentes recusam a atualização; substituir dados nunca autoriza emissão. Uma nova submissão só é permitida após 30 segundos.

Permissões de runtime: secretAccessor e secretVersionManager somente nesse secret. Não são publicados certificados, CSCs, senhas ou tokens no GitHub ou bundle. Não são modificadas rules nem dados comerciais. O emulador usa armazenamento isolado em memória.

## Limites explícitos

Recebimento não significa validação: formato/tamanho são verificados, mas senha, CNPJ e validade do PFX ainda precisam de verificação criptográfica/Focus. Este envio NÃO cria ou atualiza empresa na Focus, NÃO conclui credenciamento/tributação, NÃO autoriza emissão. Produção permanece bloqueada. As etapas seguintes são provisionamento no provedor, transmissão segura das credenciais, validação e homologação da emissão. Versões antigas podem ser retidas no cofre; definir política de retenção antes de ampliar operação comercial.

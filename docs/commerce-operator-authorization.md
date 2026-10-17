# Commerce — autorização individual

O login compartilhado do estabelecimento não autoriza as callables Commerce. A sessão individual usa um Firebase App secundário, com persistência somente em memória; não troca o usuário autenticado do ZenOS. O botão de entrada usa Google, com seleção explícita da conta. Sair do módulo ou trocar o operador local encerra essa sessão.

Em cada consulta, salvamento, solicitação comercial e upload, o servidor exige e-mail verificado e provedor Google ou senha. Consulta exclusivamente `commerce_operator_access/{uidIndividual}` pelo Admin SDK. O documento deve conter:

```json
{"ativo":true,"papel":"admin","lojaId":"UID-DO-ESTABELECIMENTO"}
```

O UID individual deve ser diferente do UID compartilhado da loja. O estabelecimento precisa existir. Não há cadastro automático, endpoint de concessão ou fallback para a permissão do menu. `lojaId`, `papel` e outros atributos enviados pelo navegador não concedem acesso. O navegador confirma que a loja retornada corresponde à loja aberta antes de disponibilizar as ações.

## Provisionamento em homologação

Somente um administrador confiável do projeto separado pode criar o vínculo, pelo console Firestore ou Admin SDK, depois de verificar o UID da conta individual no Firebase Authentication. Não copiar usuários, credenciais ou dados da produção. Usar lojas e produtos fictícios. `ativo:false` ou a remoção do vínculo revoga a próxima chamada, sem esperar a renovação do token. O rascunho registra o UID individual em `alteradoPor`.

As regras devem negar leitura e escrita de clientes em toda a coleção `commerce_operator_access`, em `commerce_private` e no Storage. As regras exclusivas de emulador já negam a coleção global pelo bloqueio final. **Não implantar essas regras de emulador na nuvem.** Antes de qualquer implantação de produção, auditar as regras reais, inclusive correspondências recursivas sobrepostas que possam conceder acesso por OR.

No projeto separado ainda é necessário habilitar Google no Firebase Authentication, configurar domínio autorizado, provisionar vínculos fictícios e validar o popup no navegador. A conta Google administrativa do console não equivale automaticamente a um usuário do Firebase Authentication. O login CLI também é independente.

## Evidência

`node --test functions/test/commerceAuthorization.test.mjs` verifica credenciais, papel, vínculo ausente/inativo, UID compartilhado, revogação e caminhos inválidos. `scripts/commerce-tenant-hml-emulator-check.mjs` usa duas lojas e duas contas individuais verificadas, concede o vínculo pelo Admin SDK do emulador e testa tentativa de autoautorização pelo SDK cliente. Também testa consultas/uploads de operador recusados e revogação em chamadas reais.

A integração Google popup ainda exige teste de navegador; o emulador usa email/senha verificados para reproduzir a autorização sem acessar contas reais.

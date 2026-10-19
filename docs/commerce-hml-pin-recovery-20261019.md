# Homologação Commerce — recuperação de PINs de teste

**Exclusivo do Firebase `zenos-commerce-homologacao`; não utilizar no projeto ZenOS produtivo.**

## Por que
O proprietário criou dois PINs aleatórios no bootstrap da loja fictícia e não os guardou. A autenticação Google e as regras cloud foram verificadas. A tela de terminal pede os PINs; não há recuperação de texto original porque PBKDF2 armazena apenas hash e salt.

## Mudança cirúrgica
- Callable existente `commerceHmlOperationalSeed` ganha `redefinirPins` somente para proprietário Google verificado, no projeto HML com flags/bucket explícitos, e **auth_time dos últimos 5 minutos**. Interface exige nova reautenticação Google.
- Transação Firestore lê loja, operação, licença fictícia e ambos os controles privados. Exige marcador `homologacao_operacional`, `testeSomente`, UID proprietário, licença fictícia, exatamente os dois operadores originais e equivalência com os hashes privados.
- Gera PBKDF2 v2, sal aleatório para cada PIN. Atualiza somente `vendedores` na operação e duas credenciais privadas, com incremento de `versao` para invalidar sessões Commerce antigas. Não grava PIN em texto, não muda produtos, caixa, vendas, pedidos, clientes ou histórico.
- Interface de recuperação **somente no build operacional HML**, com confirmação Google e mensagens de sucesso/erro. Após redefinir, usuário recarrega a página para obter hashes novos.
- O seletor de deploy verifica presença da nova autorização e transação. Hosting curto `op-hml-19` pode ser atualizado sem tocar canal `live`.

## Testes
- Tests Functions: conta Google recente, PINs distintos, hashes corretos, dados financeiros preservados, nenhuma credencial incongruente, validação de ambiente HML e escrita atômica.
- Vitest interface: reautenticar Google antes do request, mensagem de êxito, bloqueio quando reautenticação falhar.
- CI: Commerce check/UI/emuladores e release gate no último SHA.

## Operação controlada — Cloud Shell
Depois de CI aprovado e `git fetch origin feat/commerce-hml-pin-recovery-20261019` + checkout do SHA correto:
1. `npm install --prefix functions --no-package-lock --ignore-scripts --no-audit --no-fund` se faltar dependência local.
2. `node scripts/commerce-operational-hml-seed-deploy.mjs --check`.
3. `node scripts/commerce-operational-hml-seed-deploy.mjs --deploy-seed` — apenas atualização da callable no projeto HML.
4. `node scripts/commerce-cloud-hml-frontend.mjs` — obtém somente configuração pública do SDK.
5. `node scripts/commerce-operational-hml-preview.mjs --publish-short-preview` — publica SOMENTE Hosting preview curto `op-hml-19`; não usar link do canal antigo com 404.
6. Abra a URL exata exibida e clique `Esqueci os PINs de teste`. Defina novos PINs fortes distintos de 8–12 dígitos; reautentique com Google; confirme os dois; recarregue e entre.
7. Verifique produtos, históricos e caixa antes e após a redefinição; não fazer qualquer nova seed.

## Proteções de publicação
Nada de merge na main, Hosting live, firestore rules, Auth, Storage ou mudanças de clientes. Se a callable rejeitar, conferir sem reexecutar tentativas consecutivas. Não salvar nem compartilhar PINs, tokens ou códigos Google em prints/logs/chat. Se a versão privada ou dados não coincidirem, o processo falha sem escrita.

**Nenhuma Function nem Hosting é publicada pelo commit GitHub.** Deploy real exige Cloud Shell autenticado e verificação após publicação.

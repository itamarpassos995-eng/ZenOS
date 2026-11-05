# V2 nativa e migração das lojas existentes

## Estado desta entrega

O código permite novas contas na V2, mas a ativação vem **desligada**. Publicar
esta branch não migra lojas existentes. VIPE e Central Motos mantêm a rota V2
e os documentos já certificados. Não publicar regras de protótipo diretamente.

Sem credencial administrativa neste ambiente, nenhum inventário ou alteração
de produção foi executado por esta entrega. Testes usam `demo-zenos-local`.

## Levantamento das contas existentes — somente leitura

Em um checkout desta branch no Cloud Shell autenticado:

```bash
python3 scripts/recovery/audit_store_routes.py --project zenos-ac6b2 --out zenos-storage-inventory.json
```

O relatório não contém cadastros dos consumidores. Inclui UID/e-mail da empresa,
rota, contagens e estimativa de tamanho JSON da V1 (não bytes exatos Firestore).
Consulta as raízes com paginação de 50, dois documentos pontuais por loja e
limite padrão de 500 lojas. Não percorre subcoleções, não escuta mudanças e não
migra. As leituras são cobradas normalmente; não há promessa de custo zero.

## Ativação das contas novas — ordem obrigatória

1. Passar CI e testes de emulador. Guardar o SHA exato do frontend testado.
2. Instalar e publicar **somente** o codebase novo de operações:

   ```bash
   npm ci --prefix operational-functions
   npx firebase-tools deploy --only functions:operational:provisionNativeV2Store --config firebase.operational.json --project zenos-ac6b2
   ```

   O arquivo separado preserva o codebase fiscal. Usar a identidade operacional
   administrativa existente; não ampliar permissões da identidade fiscal.

3. Preparar a extensão das regras reais, preservando todos os pilotos atuais:

   ```bash
   python3 scripts/recovery/native_v2_release.py prepare --workdir native-v2-release
   ```

   Conferir `original.rules`, `native.rules` e `manifest.json`. Fonte divergente
   do modelo integral conhecido interrompe a preparação. Não substituir regras
   diferentes por um modelo presumido.

4. Publicar e confirmar as regras preparadas:

   ```bash
   python3 scripts/recovery/native_v2_release.py publish-rules --workdir native-v2-release
   ```

   A proteção nativa depende de `storage_control.origin == 'native-v2'`, criado
   pelo backend. Novas lojas não precisam de UID adicionado manualmente às
   regras. A política administrativa `system/storage_policy` fica inacessível
   aos clientes. A base anterior das lojas legadas é preservada; esta entrega
   não representa auditoria completa das permissões históricas. Há consultas
   pontuais dependentes de regras, potencialmente faturáveis, sem listeners novos.

5. Aguardar propagação das regras (até 10 minutos para listeners já abertos).
   Publicar frontend testado com `VITE_ZENOS_NATIVE_V2_ENABLED=true` na Vercel e
   confirmar o SHA/alias oficial. Não ativar o gate do servidor antes das regras
   propagadas e do backend publicado. Esta troca de frontend pode exigir uma
   atualização de página em sessões antigas; não recarregar durante uma venda.

6. Habilitar o gate administrativo com o SHA exato publicado:

   ```bash
   python3 scripts/recovery/native_v2_release.py enable --workdir native-v2-release --frontend-commit SHA_EXATO_DE_40_CARACTERES
   ```

   Esse comando cria apenas `system/storage_policy`, nunca documentos de lojas.
   Só contas cuja raiz `createdAtServer` seja posterior à ativação podem receber
   o armazenamento vazio. Conta antiga sem operação é bloqueada para inspeção;
   não é reiniciada. Reexecução com a mesma política não muda a data de corte.

7. Validar uma conta nova autorizada: troca obrigatória de PIN, cliente, produto,
   venda, fechamento e recarga. Conferir ausência de `dados/operacao`, presença
   do certificado e recibos V2. Confirmar lojas existentes sem mudança de rota.
   Não anunciar conclusão global sem essa validação de produção.

Se a função falhar ou a certificação não existir, a abertura V2 falha claramente.
O cliente atualizado não cria V1 como alternativa. A sessão antiga que tentar
criar V1 depois da ativação nativa será recusada pelas regras, sem sucesso falso.

## Lojas antigas

O inventário não substitui a janela de migração. Escolher uma loja parada, obter
backup íntegro e testar o executor com esse backup. Só então executar
`production_recovery.py migrate` com a evidência correspondente e o SHA de
frontend confirmado. O executor cerca escritores V1, reconcilia, cria destinos
sem sobrescrever e ativa individualmente. Não usar evidência da VIPE para outra
empresa. Não migrar lojas em lote nem durante vendas/lançamentos em andamento.

Não executar migração novamente na VIPE ou Central Motos. A versão das regras
preserva os IDs protegidos e a proteção nativa nas migrações posteriores.

## Testes reproduzíveis

```bash
npm ci
npm ci --prefix operational-functions
npm test --prefix operational-functions
python3 -m unittest discover -s scripts/recovery -p 'test_pilot_rules_rollout.py'
python3 -m unittest discover -s scripts/recovery -p 'test_audit_store_routes.py'
python3 -m unittest discover -s scripts/recovery -p 'test_native_v2_release.py'
python3 -m unittest discover -s scripts/recovery -p 'test_production_recovery.py'
npx vitest run --config vitest.recovery.config.js scripts/recovery/native-v2-bootstrap.ui.test.jsx
npx firebase-tools@14.12.0 emulators:exec --only auth,firestore --project demo-zenos-local --config firebase.recovery-fenced.json 'node scripts/recovery/native-v2.emulator.mjs && node scripts/recovery/v2-rollout-rules.emulator.mjs'
npm run build
```

O teste de emulador verifica concorrência idempotente, regra administrativa,
primeiro cadastro real pela persistência do app, recarga, bloqueio V1/cross-tenant,
preservação de loja legada e recusa a conta antiga sem dados. O teste de abertura
verifica gate desligado, leitura V1 reaproveitada, falha fechada e concorrência.

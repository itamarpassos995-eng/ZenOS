# ZenOS Commerce — implantação seletiva no Firebase de HOMOLOGAÇÃO (19/10/2026)

## Situação e escopo
- **Somente** projeto `zenos-commerce-homologacao`; **nunca** o projeto operacional `zenos-ac6b2`.
- A loja pública de homologação existente no canal **live** continua **intocada**.
- PRs dependentes: #50 → #51 → #52 → #53 → #54 → este PR. Fazer revisão de rebase antes de qualquer integração.
- **Não há homologação real cloud neste PR**: código, preflights e CI prontos, sem credenciais administrativas neste ambiente.
- Emuladores V1/V2 e regras isoladas já foram validados; a auditoria das regras HML é diferente da operação cloud real.

## O que é seguro fazer ANTES de pedir credenciais de nuvem
1. Em cópia limpa da branch, `npm ci --ignore-scripts`; executar `node scripts/commerce-operational-hml-preview.mjs --check` e `node scripts/commerce-operational-hml-seed-deploy.mjs --check`.
2. CI exige build normal, `commerce-hml`, `commerce-operational-hml`, regras reais no Firestore Emulator, testes Functions, PDV e resiliência. Não aceitar status de commit anterior.
3. Confirmar que `firebase.commerce.operational-preview.json` contém **somente Hosting**, com `public=dist-commerce-operational-hml`; jamais usar `firebase.json` sem `--config`.
4. Os scripts só possuem destinos constantes, sem parâmetros para substituir projeto/conta, e recusam `GCLOUD_PROJECT`/variantes divergentes.

## Etapa A — publicação da interface em um canal de PRÉVIA (não altera live)
O operador autorizado com Firebase CLI autenticado executa no mesmo checkout aprovado:
```sh
node scripts/commerce-cloud-hml-frontend.mjs
node scripts/commerce-operational-hml-preview.mjs --build
node scripts/commerce-operational-hml-preview.mjs --publish-preview
```
- O primeiro comando obtém apenas o SDK **público** de `zenos-commerce-homologacao`. Não colar chaves administrativas no chat.
- `--build` exige o domínio Auth e bucket exatos; habilita a ponte apenas no build HML operacional.
- `--publish-preview` usa `firebase hosting:channel:deploy operacional-interno-20261019 --expires 7d`, sem deploy para o canal **live**, Firestore, Functions, Auth ou Storage. A URL exata sai da CLI: **não inventar**.
- Atenção: o link de prévia é publicamente acessível a quem o conhecer, embora a tela operacional exija login Google autorizado. Ajustar domínio autorizado no Auth HML antes do teste com navegador; não habilitar identidades reais de clientes.

## Etapa B — seed backend (sem regras cloud)
```sh
node scripts/commerce-operational-hml-seed-deploy.mjs --check
node scripts/commerce-operational-hml-seed-deploy.mjs --deploy-seed
```
- Atualiza **somente** `functions:fiscal:commerceHmlOperationalSeed` no projeto HML.
- A Function recusa qualquer projeto divergente, conta Google não autorizada e tentativa de sobrescrever documentos pré-existentes. Requer autenticação válida, não aceita dados reais.
- Não substitui Functions Commerce/PDV, regras Firestore, Storage, Auth nem Hosting. O app completo ainda depende do passo C.

## Etapa C — auditoria de REGRAS REMOTAS e autorização separada
**Esta etapa NÃO está automatizada nem autorizada para publicação por este PR.**
1. Ler e salvar no armazenamento seguro o **ruleset remoto atual**, ID de release, versão e data do projeto HML; validar que o ruleset é exatamente o esperado antes de qualquer alteração. Não presumir que ainda é deny-all.
2. Guardar cópia verificável do ruleset e instrução de rollback. Sem backup remoto confirmado, **não publicar regras**.
3. Revalidar a HML na mesma versão de Functions, UID proprietário Google e **somente V1**. O novo ruleset `firestore.commerce.operational-hml.rules` foi aprovado no Emulator, mas não foi aplicado ao banco cloud.
4. Fazer revisão de privilégios: regras HML ainda permitem gravações de documentos operacionais pelo proprietário (adequado **somente para dados fictícios**); nunca publicar estas regras na produção ou em lojas reais. `storage_control` é read-only para impedir alternância acidental a V2; coleção `v2_generations` continua negada.
5. Se remoto divergir ou qualquer controle falhar, bloquear a operação e registrar a divergência. **Não aplicar substituição em nome de recuperação**.

## Etapa D — teste real de funcionamento
Usar loja/operadores/produtos **fictícios**. Fluxo: pedido público → contador → central → pré-pedido → refresh/rede instável → dois operadores concorrendo → venda única → conferência do histórico e do caixa → Share V2 → desktop e celular. Testes de Auth, IAM e Storage exigem nuvem real. Não usar PIN de clientes.

## Recuperação/rollback sem exclusão de dados
- **Interface:** deixar canal de prévia expirar em sete dias ou revogar o canal de teste se necessário; o site HML **live** não foi modificado.
- **Seed:** desativar o acesso administrativo pelo controle de serviço, se houver incidente, mantendo documentos e auditorias já escritos. Não executar rotina de reset ou exclusão dos documentos fictícios como rollback.
- **Regras:** restaurar a versão remota exata **previamente armazenada** do ruleset, não uma cópia presumida do repositório. O rollback de regras bloqueia acessos; os dados permanecem armazenados.
- **Venda:** nunca apagar ou duplicar recibos `commerce_faturamentos`. Recuperar via leitura do servidor; não relançar estoque/financeiro por tentativa.
- **Go/no-go:** PR em rascunho, sem merge e sem ativação por cliente até todos os testes reais/ambientes serem comprovados.

## Evidência de CI
Aguardar os jobs do **SHA final** do PR; não confundir build, regra testada em Emulator ou prévia com integração funcional na nuvem. Registrar links de execuções e falhas no PR. A conta conectada a este chat oferece GitHub, mas não uma ferramenta operacional do Firebase para aplicar o deploy com a identidade administrativa existente; os scripts acima exigem a sessão Firebase CLI autorizada, não credenciais compartilhadas no chat.

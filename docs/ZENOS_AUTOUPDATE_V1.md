# ZenOS AutoUpdate V1 — homologação (sem deploy de produção)

## Diagnóstico (main, 2026-11-02)
- Vite 5, build com arquivos JS/CSS com hash. `index.html` carrega `src/main.jsx`.
- `public/manifest.json` configura instalação standalone; não foi encontrado registro de Service Worker no código pesquisado nem `public/sw.js` / `public/service-worker.js`. Manifest isolado não prova funcionamento offline PWA.
- `vercel.json` não tinha headers explícitos para HTML. Atualizações podem parecer presas quando o navegador mantém documento HTML antigo.
- Sincronização crítica é controlada por `nuvemSincronizada`, `statusSincronizacao`, `syncCamposRef`, `syncWriteQueueRef` e commit transacional. O sistema usa `localStorage` e armazenamento Firestore. Não é seguro recarregar durante uso do PDV.

## Implementação
- Build define SHA do commit a partir de `VERCEL_GIT_COMMIT_SHA`; se ausente, AutoUpdate permanece desligado (fail closed).
- `GET /api/version` retorna somente SHA da Vercel com `Cache-Control: no-store`. Nenhuma importação Firebase, nenhum listener, nenhuma leitura Firestore.
- Cliente verifica mesma origem a cada ~15 min e ao retomar aba (limite mínimo de 60 s entre chamadas), com timeout de 8 s.
- A versão diferente só é aplicada após 90 s em estado seguro: usuário autenticado, bootstrap confirmado, status de sincronização confirmado, **nenhum operador ativo**, tela hub, nenhuma fila de escrita, nenhuma falha ou modal/edição. Revalida o estado imediatamente antes do reload.
- Se houver venda, pagamento, fechamento, sincronização pendente, modal, campo em edição, aba oculta ou offline: não recarrega. Enquanto houver operador ativo, não recarrega, mesmo na tela hub.
- Recarregamento simples, sem limpar `localStorage`, `IndexedDB`, Cache Storage, Service Workers ou arquivos offline.
- Headers `no-store` somente para documentos HTML principais e endpoint de versão. Assets Vite com hash não são alterados.

## Limites e homologação
- O controle de segurança cobre a aplicação React principal. Uma rota independente, aba antiga ou script externo não é autorizada a disparar reload; ausência de sinal seguro impede atualização.
- Nenhuma garantia de atualização offline: se sem rede, mantém versão atual.
- A verificação não é uma atualização de esquema/dados. A aplicação não executa migrações.
- Vercel Preview pode ficar fixo em um SHA; só domínios com novo deploy apontado para o alias recebem uma versão diferente.
- Validar manualmente em Preview: operador ativo em venda, carrinho com dados, pagamento/fechamento, gravação pendente, PIN focado, aba offline e retorno ao login de operador. Confirmar que só a tela segura recarrega.
- Sem merge, sem alteração no Firebase e sem deploy de produção antes da aprovação.

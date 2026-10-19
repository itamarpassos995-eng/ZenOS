# Commerce operacional HML: liberação de regras Firestore

**Escopo:** apenas o projeto Firebase de testes zenos-commerce-homologacao, jamais a produção ZenOS.

O ambiente já tem conta Google autenticada e a loja fictícia foi preparada pelo backend. O bloqueio da tela "Nuvem não confirmada" resulta do ruleset remoto deny-all, que havia sido mantido antes de comprovar a segurança.

Os scripts deste PR exigem:
- verificação offline da configuração exclusiva de Firestore rules
- backup com permissão 0600 da versão remota, validada contra o baseline deny-all
- publicação restrita a Firestore rules do projeto de testes, sem alterar Hosting, funções, autenticação ou armazenamento
- conferência posterior do ruleset remoto exato
- retorno ao deny-all apenas com backup confirmado e estado remoto sem divergências

Os testes de regras no Emulator e o gate de regressão precisam passar no último commit antes da troca remota.

Depois da publicação, a confirmação visual deve ser feita com o botão "Tentar conectar novamente", sem recriar operadores ou reinserir PINs. A liberação de regras não comprova faturamento: ainda faltam os testes completos de pedido, pré-pedido, concorrência, caixa, estoque, recuperação de falha e Share V2.

O rollback mantém intactos todos os dados do ambiente fictício. O PR permanece em rascunho e não representa autorização de publicação em produção.

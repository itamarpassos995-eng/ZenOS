# ATT 10.1 RC1.2 — Homologação mobile / PIN de terminal

Correção estritamente limitada à homologação mobile por LAN.

## Problema reproduzido

Ao abrir o Vite por `http://IP-DO-PC:5173` no celular, Firebase Auth e Firestore alcançam os emuladores, porém o navegador móvel não disponibiliza `crypto.subtle` em origem HTTP de LAN. Operadores com PIN PBKDF2 (`pinHash`/`pinSalt`) não conseguiam ser validados e o terminal permanecia bloqueado.

## Correção

- Produção continua usando Web Crypto/PBKDF2 no navegador, sem alteração.
- Homologação em localhost continua usando Web Crypto normalmente.
- Somente quando Web Crypto não está disponível **e** o runtime é HOMOLOGAÇÃO, o cálculo PBKDF2 é delegado ao próprio servidor Vite de homologação via endpoint same-origin temporário.
- A ponte Vite só existe quando `mode === homologacao`; não é registrada no build/servidor de produção.
- `TerminalLogin` agora mostra falha técnica caso a validação de PIN não possa ser executada, em vez de permanecer silenciosamente na tela.

Nenhuma regra de permissão, PIN, PDV, caixa, estoque, venda, compra ou persistência foi alterada.

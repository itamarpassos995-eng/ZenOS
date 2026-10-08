# ATT 10.1 RC1.1 — Homologação mobile por LAN

## Escopo
Correção cirúrgica exclusiva para permitir que um celular na mesma rede Wi‑Fi do computador acesse o ZenOS em homologação e use os mesmos emuladores Firebase locais.

## Segurança preservada
- Produção continua usando o projeto `zenos-ac6b2` somente fora de homologação.
- Homologação continua usando exclusivamente `demo-zenos-local`.
- `npm run dev` permanece inalterado e local-only.
- `npm run emulators` permanece inalterado e local-only.
- O modo LAN é opt-in pelos scripts `dev:mobile` e `emulators:mobile`.
- A UI dos emuladores permanece ligada somente em `127.0.0.1:4000`.

## Arquivos alterados
- `src/core/runtimeEnvironment.js`: em homologação via LAN, usa o hostname que abriu o ZenOS como host dos emuladores. Em localhost continua em `127.0.0.1`.
- `package.json`: adiciona scripts móveis sem alterar scripts existentes.

## Arquivos criados
- `firebase.mobile.json`: Auth/Firestore escutam `0.0.0.0` apenas quando o script mobile é usado; UI continua local.
- `scripts/mobile-homologacao-check.mjs`: gate estático específico da correção.
- `docs/ATT101_MOBILE_HOMOLOGACAO.md`: este registro.

## Como testar no Windows
Terminal 1:

```powershell
npm.cmd run emulators:mobile
```

Terminal 2:

```powershell
npm.cmd run dev:mobile
```

Abra no celular, na mesma Wi‑Fi, o endereço `Network` mostrado pelo Vite, por exemplo `http://192.168.1.20:5173/`.

Se o Firewall do Windows solicitar permissão para Node/Java, permita somente em redes privadas.

## Critério de aprovação
1. Banner de homologação visível no celular.
2. Login do Auth Emulator funciona no celular.
3. Dashboard carrega dados do Firestore Emulator.
4. PC e celular enxergam o mesmo estado de homologação.
5. Nenhuma chamada usa o projeto de produção.

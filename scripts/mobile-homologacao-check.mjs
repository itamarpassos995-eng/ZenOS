import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const runtime = read('src/core/runtimeEnvironment.js');
const firebase = read('src/firebase.js');
const cfg = JSON.parse(read('firebase.mobile.json'));
const pkg = JSON.parse(read('package.json'));
const operatorPin = read('src/core/operatorPin.js');
const terminalLogin = read('src/components/TerminalLogin.jsx');
const vite = read('vite.config.js');

const checks = [];
const check = (name, condition) => checks.push({ name, ok: Boolean(condition) });

check('localhost continua usando loopback', runtime.includes("localhost ? '127.0.0.1' : hostname"));
check('LAN usa hostname do navegador para emuladores', runtime.includes("VITE_ZENOS_EMULATOR_HOST || (localhost ? '127.0.0.1' : hostname)"));
check('homologação continua usando projeto demo', firebase.includes('projectId: "demo-zenos-local"'));
check('produção continua separada', firebase.includes('projectId: "zenos-ac6b2"'));
check('Auth mobile escuta LAN', cfg?.emulators?.auth?.host === '0.0.0.0' && cfg?.emulators?.auth?.port === 9099);
check('Firestore mobile escuta LAN', cfg?.emulators?.firestore?.host === '0.0.0.0' && cfg?.emulators?.firestore?.port === 8080);
check('UI dos emuladores continua restrita ao PC', cfg?.emulators?.ui?.host === '127.0.0.1');
check('script dev:mobile expõe somente servidor de homologação', pkg.scripts?.['dev:mobile'] === 'vite --mode homologacao --host 0.0.0.0');
check('script emulators:mobile usa projeto demo e config dedicada', String(pkg.scripts?.['emulators:mobile']).includes('demo-zenos-local') && String(pkg.scripts?.['emulators:mobile']).includes('firebase.mobile.json'));
check('PIN mantém Web Crypto quando disponível', operatorPin.includes('globalThis.crypto?.subtle'));
check('fallback de PIN existe somente para homologação', operatorPin.includes('ZENOS_RUNTIME.isHomologacao') && operatorPin.includes('/__zenos_hml_pin/hash'));
check('Vite expõe ponte PBKDF2 somente em homologação', vite.includes("mode === 'homologacao' ? zenosHomologacaoPinBridge() : null") && vite.includes('pbkdf2Sync'));
check('Terminal mostra erro de validação em vez de travar silenciosamente', terminalLogin.includes("[ZenOS][TERMINAL] Falha ao validar PIN do operador."));

for (const t of checks) console.log(`${t.ok ? '[OK]' : '[FALHA]'} ${t.name}`);
const failed = checks.filter((t) => !t.ok);
console.log(`\nMOBILE HML: ${checks.length - failed.length}/${checks.length} verificações aprovadas.`);
if (failed.length) process.exit(1);

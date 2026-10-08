import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const tests = [];
const check = (name, condition) => tests.push({ name, ok: Boolean(condition) });

const firebase = read('src/firebase.js');
const runtime = read('src/core/runtimeEnvironment.js');
const storage = read('src/core/storage.js');
const main = read('src/main.jsx');
const pkg = JSON.parse(read('package.json'));
const sources = [
  'src/App.jsx',
  'src/components/Configuracoes.jsx',
  'src/components/Vendas.jsx',
  'src/components/Mesas.jsx',
  'src/components/Comissoes.jsx',
  'src/core/persistenceSafety.js',
].map(read).join('\n');

check('localhost força HOMOLOGAÇÃO', runtime.includes("hostname === 'localhost'") && runtime.includes("environment: (localhost || modeHomologacao) ? 'HOMOLOGACAO'"));
check('homologação usa projectId demo-zenos-local', firebase.includes('projectId: "demo-zenos-local"'));
check('produção mantém projectId zenos-ac6b2', firebase.includes('projectId: "zenos-ac6b2"'));
check('Auth homologação aponta para emulador', firebase.includes('connectAuthEmulator'));
check('Firestore homologação aponta para emulador', firebase.includes('connectFirestoreEmulator'));
check('Analytics não é inicializado no ramo de homologação', firebase.indexOf('getAnalytics(app)') > firebase.indexOf('} else {'));
check('banner de homologação está montado globalmente', main.includes('<EnvironmentBanner />'));
check('localStorage operacional passa por namespace seguro', !sources.includes('localStorage.getItem(') && !sources.includes('localStorage.setItem('));
check('storage de homologação usa prefixo próprio', runtime.includes("storageNamespace: (localhost || modeHomologacao) ? 'zenos_hml__'"));
{
  const appSource = read('src/App.jsx');
  const usaCacheUid = appSource.includes('zenos_${user.uid}_${chave}');
  const usaLegadoGenerico = appSource.includes('zenos_${chave}');
  const legadoProtegido = appSource.includes('if (!ZENOS_RUNTIME.isHomologacao)');
  check('App não lê cache legado genérico em homologação', usaCacheUid && (!usaLegadoGenerico || legadoProtegido));
}
check('script dev padrão inicia em modo homologação', pkg.scripts?.dev === 'vite --mode homologacao');
check('script dev:test fixa projeto demo e emuladores', String(pkg.scripts?.['dev:test']).includes('demo-zenos-local') && String(pkg.scripts?.['dev:test']).includes('emulators:exec'));
check('.firebaserc aponta somente para demo-zenos-local', read('.firebaserc').includes('demo-zenos-local') && !read('.firebaserc').includes('zenos-ac6b2'));
check('regras de homologação são somente-emulador e exigem autenticação', read('firestore.emulator.rules').includes('SOMENTE PARA O EMULADOR LOCAL') && read('firestore.emulator.rules').includes('request.auth != null'));
check('ATT 01.1 não adiciona deleteDoc', !sources.includes('deleteDoc'));
check('ATT 01.1 não adiciona deleteField', !sources.includes('deleteField'));

for (const t of tests) console.log(`${t.ok ? '[OK]' : '[FALHA]'} ${t.name}`);
const failed = tests.filter(t => !t.ok);
console.log(`\nATT 01.1: ${tests.length - failed.length}/${tests.length} verificações aprovadas.`);
if (failed.length) process.exit(1);

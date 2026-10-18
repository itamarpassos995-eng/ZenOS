import { spawnSync } from 'node:child_process';

// No production credentials, customer backups or production transport are needed.
const emulator = process.argv.includes('--emulator');
if (emulator && (process.env.GCLOUD_PROJECT !== 'demo-zenos-local' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099')) {
  console.error('Release checks require loopback Auth/Firestore emulators and demo-zenos-local.');
  process.exit(1);
}

const checks = emulator ? [
  'scripts/p0-fiado-v2-emulator.mjs',
  'scripts/att07-emulator-check.mjs',
  'scripts/att09-emulator-check.mjs',
] : [
  'scripts/att02-check.mjs',
  'scripts/att03-check.mjs',
  'scripts/att04-check.mjs',
  'scripts/purchase-costs-check.mjs',
  'scripts/cash-multicurrency-p0-check.mjs',
  'scripts/p0-credit-reconciliation-check.mjs',
  'scripts/p0-client-receipt-check.mjs',
  'scripts/p0-fiado-link-audit-check.mjs',
  'scripts/att1021-prepedido-check.mjs',
  'scripts/pdv-rascunho-check.mjs',
  'scripts/v2-tombstone-check.mjs',
  'scripts/pdv-write-intent-check.mjs',
];

function run(args) {
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit', timeout: 180_000, env: process.env,
  });
  if (result.error || result.signal || result.status !== 0) {
    console.error('Release blocked:', args.join(' '), result.error?.message || result.signal || result.status);
    process.exit(1);
  }
}

for (const check of checks) run([check]);
if (!emulator) run([
  'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.recovery.config.js',
  'scripts/recovery/pdv-draft.ui.test.jsx',
  'scripts/recovery/clientes-receipt.ui.test.jsx',
  'scripts/recovery/clientes-quitado-status.ui.test.jsx',
  'scripts/recovery/exchange-rate.ui.test.jsx',
]);
console.log(`Release ${emulator ? 'emulator' : 'business/UI'} checks passed.`);

import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMoneyDeploymentIsolation } from './money-deployment-fence.mjs';
test('experimental branch refuses both preview and production remote builds', () => {
  for (const env of [{VERCEL:'1'}, {VERCEL_ENV:'preview'}, {VERCEL_ENV:'production'}])
    assert.throws(() => assertMoneyDeploymentIsolation(env), /deployment remoto bloqueado/);
  assert.doesNotThrow(() => assertMoneyDeploymentIsolation({}));
});

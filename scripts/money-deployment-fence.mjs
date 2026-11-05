// This experimental branch has no approved remote backend. A Vercel build must
// fail before producing a deployment with inherited production API credentials.
export function assertMoneyDeploymentIsolation(env = process.env) {
  if (env.VERCEL === '1' || env.VERCEL_ENV) {
    throw new Error('Multimoeda experimental: deployment remoto bloqueado até comprovar isolamento de Firebase, Commerce, Blob, fiscal e demais serviços. Use homologação local.');
  }
}

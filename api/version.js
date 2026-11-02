// Endpoint leve: somente o SHA do deploy atual da Vercel. Zero Firebase/Firestore.
const SHA_RE = /^[0-9a-f]{40}$/i;
export const resolveBuildVersion = (env = process.env) => {
  const sha = String(env.VERCEL_GIT_COMMIT_SHA || '').trim();
  return SHA_RE.test(sha) ? sha.toLowerCase() : null;
};

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  return res.status(200).json({ version: resolveBuildVersion() });
}

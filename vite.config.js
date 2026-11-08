import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash, pbkdf2Sync } from 'node:crypto'
import { resolve } from 'node:path'

const PIN_ITERATIONS = 120000

function zenosHomologacaoPinBridge() {
  return {
    name: 'zenos-homologacao-pin-bridge',
    configureServer(server) {
      server.middlewares.use('/__zenos_hml_pin/hash', (req, res, next) => {
        if (req.method !== 'POST') return next()

        let raw = ''
        req.setEncoding('utf8')
        req.on('data', (chunk) => {
          raw += chunk
          if (raw.length > 16384) req.destroy()
        })
        req.on('end', () => {
          try {
            const body = JSON.parse(raw || '{}')
            const pin = String(body.pin ?? '')
            const salt = String(body.salt ?? '')
            const version = Number(body.version || 2)
            if (!pin || !salt || !/^[0-9a-f]+$/i.test(salt) || salt.length % 2 !== 0) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              return res.end(JSON.stringify({ error: 'invalid_payload' }))
            }

            let hash
            if (version === 1) {
              hash = createHash('sha256').update(`${salt}|${pin}`, 'utf8').digest('hex')
            } else if (version === 2) {
              hash = pbkdf2Sync(pin, Buffer.from(salt, 'hex'), PIN_ITERATIONS, 32, 'sha256').toString('hex')
            } else {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              return res.end(JSON.stringify({ error: 'unsupported_version' }))
            }

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'no-store')
            return res.end(JSON.stringify({ hash }))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ error: 'pin_bridge_failed' }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env=loadEnv(mode,process.cwd(),'VITE_');
  const staging=env.VITE_ZENOS_ENV==='staging';
  if(staging&&(env.VITE_FIREBASE_PROJECT_ID!=='zenos-distribution-staging'||
   env.VITE_FIREBASE_AUTH_DOMAIN!=='zenos-distribution-staging.firebaseapp.com'||
   !env.VITE_FIREBASE_API_KEY?.trim()||!env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim()||
   !env.VITE_FIREBASE_APP_ID?.startsWith('1:'+env.VITE_FIREBASE_MESSAGING_SENDER_ID+':web:'))){
   throw Error('Invalid Firebase configuration for ZenOS Distribution staging');
  }
  return {
  server: { proxy: mode === 'homologacao' ? { '/__distribution': { target: 'http://127.0.0.1:8787', rewrite: path => path.replace(/^\/__distribution/, '') } } : {} },
  build: {
    rollupOptions: {
      input: staging ? {distribution:resolve(process.cwd(),'distribution-homologacao.html')} : {
        main: resolve(process.cwd(), 'index.html'),
        commerceHomologacao: resolve(process.cwd(), 'commerce-homologacao.html'),
        distributionDemo: resolve(process.cwd(), 'distribution-demo.html'),
      },
    },
  },
  plugins: [
    react(),
    mode === 'homologacao' ? zenosHomologacaoPinBridge() : null,
  ].filter(Boolean),
  }
})

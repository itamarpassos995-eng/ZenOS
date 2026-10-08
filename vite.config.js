import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash, pbkdf2Sync } from 'node:crypto'

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

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === 'homologacao' ? zenosHomologacaoPinBridge() : null,
  ].filter(Boolean),
}))

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { WebSocketServer } from 'ws'
import { loadEnv } from './env'
import { logger } from './logger'
import { routes } from './routes'
import { onClose, onConnect, onMessage } from './ws/handler'
import {
  onVoiceRealtimeClose,
  onVoiceRealtimeConnect,
  onVoiceRealtimeMessage,
} from './ws/voice-realtime'

const env = loadEnv()

const app = new Hono()
app.route('/', routes)

const server = serve(
  { fetch: app.fetch, port: env.PORT },
  ({ port }) => logger.info({ port, env: env.NODE_ENV }, '🚀 BrainPal API up'),
)

const wss = new WebSocketServer({ noServer: true })
const voiceRtWss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '', 'http://localhost')

  if (url.pathname === '/live') {
    // Camera perception WebSocket
    wss.handleUpgrade(req, socket, head, (ws) => {
      onConnect(ws)
      ws.on('message', (data) => onMessage(ws, data as Buffer))
      ws.on('close', () => onClose(ws))
      ws.on('error', (err) => logger.error({ err: String(err) }, 'ws.error'))
    })
    return
  }

  if (url.pathname === '/voice-rt') {
    // Real-time voice WebSocket (OpenAI Realtime API)
    voiceRtWss.handleUpgrade(req, socket, head, (ws) => {
      onVoiceRealtimeConnect(ws)
      ws.on('message', (data) => onVoiceRealtimeMessage(ws, data as Buffer))
      ws.on('close', () => onVoiceRealtimeClose(ws))
      ws.on('error', (err) => logger.error({ err: String(err) }, 'voice_rt.ws.error'))
    })
    return
  }

  socket.destroy()
})

export default app

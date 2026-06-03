import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
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
import {
  onTwilioMediaClose,
  onTwilioMediaConnect,
  onTwilioMediaMessage,
} from './ws/twilio-media'

const env = loadEnv()

const app = new Hono()

// CORS — allow all origins in dev, tighten in prod via ALLOWED_ORIGINS env.
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}))

app.route('/', routes)

const server = serve(
  { fetch: app.fetch, port: env.PORT },
  ({ port }) => logger.info({ port, env: env.NODE_ENV }, '🚀 BrainPal API up'),
)

const wss = new WebSocketServer({ noServer: true })
const voiceRtWss = new WebSocketServer({ noServer: true })
const twilioMediaWss = new WebSocketServer({ noServer: true })

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

  if (url.pathname === '/twilio-media') {
    // Twilio Media Stream ↔ OpenAI Realtime bridge (voice-task calls)
    twilioMediaWss.handleUpgrade(req, socket, head, (ws) => {
      onTwilioMediaConnect(ws)
      ws.on('message', (data) => onTwilioMediaMessage(ws, data as Buffer))
      ws.on('close', () => onTwilioMediaClose(ws))
      ws.on('error', (err) => logger.error({ err: String(err) }, 'twilio_media.ws.error'))
    })
    return
  }

  socket.destroy()
})

export default app

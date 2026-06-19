import { createServer } from 'node:http'
import { getRequestListener } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { WebSocketServer } from 'ws'
import { loadEnv } from './env'
import { logger } from './logger'
import { routes } from './routes'
import { handleMcpRequest } from './mcp/route'
import {
  handleAuthServerMetadata,
  handleAuthorize,
  handleAuthorizeCallback,
  handleProtectedResourceMetadata,
  handleToken,
} from './mcp/oauth-handlers'
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
import {
  onGeminiLiveClose,
  onGeminiLiveConnect,
  onGeminiLiveMessage,
} from './ws/gemini-live-bridge'

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

const honoListener = getRequestListener(app.fetch)

const server = createServer((req, res) => {
  const pathname = req.url?.split('?')[0]

  // CORS for all intercepted routes
  const setCors = () => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID, Mcp-Protocol-Version')
  }

  if (req.method === 'OPTIONS' && (pathname === '/mcp' || pathname?.startsWith('/oauth') || pathname?.startsWith('/.well-known'))) {
    setCors()
    res.writeHead(204)
    res.end()
    return
  }

  // MCP endpoint
  if (pathname === '/mcp') {
    setCors()
    handleMcpRequest(req, res)
    return
  }

  // OAuth discovery
  if (pathname === '/.well-known/oauth-protected-resource' || pathname === '/.well-known/oauth-protected-resource/mcp') {
    setCors()
    handleProtectedResourceMetadata(req, res)
    return
  }
  if (pathname === '/.well-known/oauth-authorization-server') {
    setCors()
    handleAuthServerMetadata(req, res)
    return
  }

  // OAuth endpoints
  if (pathname === '/oauth/authorize' && req.method === 'GET') {
    handleAuthorize(req, res)
    return
  }
  if (pathname === '/oauth/authorize/callback' && req.method === 'POST') {
    setCors()
    handleAuthorizeCallback(req, res)
    return
  }
  if (pathname === '/oauth/token' && req.method === 'POST') {
    setCors()
    handleToken(req, res)
    return
  }

  // Everything else goes through Hono
  honoListener(req, res)
})

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, '🚀 BrainPal API up')
})

const wss = new WebSocketServer({ noServer: true })
const voiceRtWss = new WebSocketServer({ noServer: true })
const twilioMediaWss = new WebSocketServer({ noServer: true })
const geminiLiveWss = new WebSocketServer({ noServer: true })

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

  if (url.pathname === '/live-rt') {
    // Gemini Live bridge — real-time camera + voice (Vertex AI)
    geminiLiveWss.handleUpgrade(req, socket, head, (ws) => {
      onGeminiLiveConnect(ws)
      ws.on('message', (data) => onGeminiLiveMessage(ws, data as Buffer))
      ws.on('close', () => onGeminiLiveClose(ws))
      ws.on('error', (err) => logger.error({ err: String(err) }, 'gemini_live.ws.error'))
    })
    return
  }

  socket.destroy()
})

export default app

import type { WebSocket } from 'ws'
import OpenAI from 'openai'
import { OpenAIRealtimeWS } from 'openai/beta/realtime/ws'
import { logger } from '../logger'
import { loadEnv } from '../env'

/**
 * Real-time voice WebSocket handler — /voice-rt
 *
 * Uses OpenAI Realtime API (gpt-4o-realtime-preview) for <2s latency:
 *   Mobile streams PCM16 audio → OpenAI processes in real-time
 *   → text + audio stream back → mobile plays as it arrives
 *
 * Protocol (client → server):
 *   { type: 'session.start', role: 'parent'|'kid', personaSoFar: {}, conversation: [] }
 *   Binary: [0x03][PCM16 audio chunk bytes]  (16-bit PCM, 24kHz, mono)
 *   { type: 'audio.end' }  — user stopped speaking (VAD fallback)
 *   { type: 'session.end' }
 *
 * Protocol (server → client):
 *   { type: 'session.connected' }
 *   { type: 'speech.started' }
 *   { type: 'speech.stopped' }
 *   { type: 'transcript.done', text: string }
 *   { type: 'reply.delta', text: string }
 *   { type: 'reply.done', text: string, personaUpdate: {}, done: boolean }
 *   Binary: [0x04][PCM16 audio chunk bytes]  — streaming TTS audio
 *   { type: 'audio.done' }
 *   { type: 'error', message: string }
 */

const env = loadEnv()
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

const PARENT_INSTRUCTIONS = `You are PAL — a friendly AI money buddy for families. You are onboarding a parent.

Extract these fields through natural conversation:
1. name — what their kids call them  
2. avatar — one of: 👩‍🦰 👨 👩 👴 👵 🧑
3. style — one of: chill, balanced, strict

Rules:
- 1-2 sentences max per response. This is voice.
- Ask ONE question at a time.
- React warmly to answers.
- When all 3 fields collected, say "All set!" and include [DONE] at the end.

After EVERY response, include a JSON block on a new line:
[PERSONA: {"name": "value or null", "avatar": "emoji or null", "style": "value or null"}]`

const KID_INSTRUCTIONS = `You are PAL — a sarcastic, witty AI money buddy for kids aged 10-14.

Extract these fields:
1. name — what they want to be called
2. age — 8-17
3. avatar — one of: 🧒 👦 👧 🧑 🦄 🐱 🐶
4. voiceId — one of: sarcastic, cool, wise, hyped, chill, auntie

Rules:
- 1-2 sentences max, punchy.
- Ask ONE question at a time.
- Be playful, slightly sarcastic.
- When all 4 fields collected, say "Let's go!" and include [DONE] at the end.

After EVERY response, include a JSON block:
[PERSONA: {"name": "value or null", "age": null, "avatar": "emoji or null", "voiceId": "value or null"}]`

type SessionState = {
  role: 'parent' | 'kid'
  personaSoFar: Record<string, unknown>
  realtimeWS: OpenAIRealtimeWS | null
  replyBuffer: string
}

const sessions = new WeakMap<WebSocket, SessionState>()

export function onVoiceRealtimeConnect(ws: WebSocket) {
  logger.info('voice_rt.connected')
  ws.send(JSON.stringify({ type: 'session.ready' }))
}

export async function onVoiceRealtimeMessage(ws: WebSocket, data: Buffer) {
  // Binary audio chunk [0x03][PCM16 bytes]
  if (data.length > 0 && data[0] === 0x03) {
    const state = sessions.get(ws)
    if (!state?.realtimeWS) return
    const audioChunk = data.slice(1)
    try {
      state.realtimeWS.send({
        type: 'input_audio_buffer.append',
        audio: audioChunk.toString('base64'),
      })
    } catch (err) {
      logger.warn({ err: String(err) }, 'voice_rt.audio_append_failed')
    }
    return
  }

  // JSON messages
  try {
    const msg = JSON.parse(data.toString()) as { type?: string; [k: string]: unknown }

    switch (msg.type) {
      case 'session.start':
        await handleSessionStart(ws, msg)
        break
      case 'audio.end':
        handleAudioEnd(ws)
        break
      case 'session.end':
        ws.close()
        break
    }
  } catch (err) {
    logger.warn({ err: String(err) }, 'voice_rt.message_parse_failed')
  }
}

export function onVoiceRealtimeClose(ws: WebSocket) {
  const state = sessions.get(ws)
  if (state?.realtimeWS) {
    try { state.realtimeWS.close({ code: 1000, reason: 'client_closed' }) } catch { /* ignore */ }
  }
  sessions.delete(ws)
  logger.info('voice_rt.closed')
}

async function handleSessionStart(ws: WebSocket, msg: Record<string, unknown>) {
  const role = (msg.role as 'parent' | 'kid') ?? 'parent'
  const personaSoFar = (msg.personaSoFar as Record<string, unknown>) ?? {}
  const conversation = (msg.conversation as Array<{ role: 'user' | 'assistant'; content: string }>) ?? []

  const instructions = role === 'parent' ? PARENT_INSTRUCTIONS : KID_INSTRUCTIONS
  const personaCtx = Object.keys(personaSoFar).length > 0
    ? `\n\nPersona collected so far: ${JSON.stringify(personaSoFar)}`
    : ''

  try {
    const realtimeWS = new OpenAIRealtimeWS(
      { model: 'gpt-4o-realtime-preview-2024-12-17' },
      openai,
    )

    const state: SessionState = {
      role,
      personaSoFar,
      realtimeWS,
      replyBuffer: '',
    }
    sessions.set(ws, state)

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      realtimeWS.socket.once('open', resolve)
      realtimeWS.socket.once('error', reject)
      setTimeout(() => reject(new Error('connection_timeout')), 10_000)
    })

    // Configure session
    realtimeWS.send({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: instructions + personaCtx,
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 800,
        },
        temperature: 0.7,
        max_response_output_tokens: 150,
      },
    })

    // Inject conversation history
    for (const turn of conversation.slice(-4)) {
      realtimeWS.send({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: turn.role,
          content: [{ type: 'input_text', text: turn.content }],
        },
      })
    }

    // ── Event handlers ────────────────────────────────────────────
    realtimeWS.on('input_audio_buffer.speech_started', () => {
      if (ws.readyState !== ws.OPEN) return
      ws.send(JSON.stringify({ type: 'speech.started' }))
    })

    realtimeWS.on('input_audio_buffer.speech_stopped', () => {
      if (ws.readyState !== ws.OPEN) return
      ws.send(JSON.stringify({ type: 'speech.stopped' }))
    })

    realtimeWS.on('conversation.item.input_audio_transcription.completed', (event) => {
      if (ws.readyState !== ws.OPEN) return
      const transcript = (event as { transcript?: string }).transcript ?? ''
      ws.send(JSON.stringify({ type: 'transcript.done', text: transcript }))
    })

    realtimeWS.on('response.audio_transcript.delta', (event) => {
      if (ws.readyState !== ws.OPEN) return
      const delta = (event as { delta?: string }).delta ?? ''
      state.replyBuffer += delta
      ws.send(JSON.stringify({ type: 'reply.delta', text: delta }))
    })

    realtimeWS.on('response.audio.delta', (event) => {
      if (ws.readyState !== ws.OPEN) return
      const audioB64 = (event as { delta?: string }).delta ?? ''
      if (!audioB64) return
      const audioBytes = Buffer.from(audioB64, 'base64')
      const tagged = Buffer.alloc(1 + audioBytes.length)
      tagged[0] = 0x04
      audioBytes.copy(tagged, 1)
      ws.send(tagged)
    })

    realtimeWS.on('response.done', () => {
      if (ws.readyState !== ws.OPEN) return

      const fullText = state.replyBuffer
      state.replyBuffer = ''

      // Extract persona update
      const personaMatch = fullText.match(/\[PERSONA:\s*({[^}]+})\]/)
      let personaUpdate = state.personaSoFar
      if (personaMatch) {
        try {
          const parsed = JSON.parse(personaMatch[1]) as Record<string, unknown>
          personaUpdate = { ...state.personaSoFar }
          for (const [k, v] of Object.entries(parsed)) {
            if (v !== null && v !== undefined && v !== '' && v !== 'null') {
              personaUpdate[k] = v
            }
          }
          state.personaSoFar = personaUpdate
        } catch { /* ignore */ }
      }

      const done = fullText.includes('[DONE]')
      const cleanText = fullText
        .replace(/\[PERSONA:[^\]]+\]/g, '')
        .replace('[DONE]', '')
        .trim()

      ws.send(JSON.stringify({ type: 'reply.done', text: cleanText, personaUpdate, done }))
      ws.send(JSON.stringify({ type: 'audio.done' }))
    })

    realtimeWS.on('error', (event) => {
      logger.error({ event }, 'voice_rt.openai_error')
      if (ws.readyState !== ws.OPEN) return
      ws.send(JSON.stringify({ type: 'error', message: 'Voice service error' }))
    })

    ws.send(JSON.stringify({ type: 'session.connected' }))
    logger.info({ role }, 'voice_rt.session_started')
  } catch (err) {
    logger.error({ err: String(err) }, 'voice_rt.session_start_failed')
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'error', message: 'Could not connect to voice service' }))
    }
  }
}

function handleAudioEnd(ws: WebSocket) {
  const state = sessions.get(ws)
  if (!state?.realtimeWS) return
  try {
    state.realtimeWS.send({ type: 'input_audio_buffer.commit' })
    state.realtimeWS.send({ type: 'response.create' })
  } catch (err) {
    logger.warn({ err: String(err) }, 'voice_rt.audio_end_failed')
  }
}

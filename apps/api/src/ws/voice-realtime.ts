import type { WebSocket } from 'ws'
import WebSocketClient from 'ws'
import { logger } from '../logger'
import { loadEnv } from '../env'

/**
 * Real-time voice WebSocket handler — /voice-rt
 *
 * Connects directly to OpenAI Realtime GA API:
 *   wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview
 *
 * Uses raw ws connection (not the SDK wrapper) to avoid beta API shape issues.
 *
 * Protocol (client → server):
 *   { type: 'session.start', role: 'parent'|'kid', personaSoFar: {}, conversation: [] }
 *   Binary: [0x03][PCM16 audio chunk bytes]
 *   { type: 'audio.end' }
 *   { type: 'session.end' }
 *
 * Protocol (server → client):
 *   { type: 'session.connected' }
 *   { type: 'speech.started' }
 *   { type: 'speech.stopped' }
 *   { type: 'transcript.done', text: string }
 *   { type: 'reply.delta', text: string }
 *   { type: 'reply.done', text: string, personaUpdate: {}, done: boolean }
 *   Binary: [0x04][PCM16 audio chunk bytes]
 *   { type: 'audio.done' }
 *   { type: 'error', message: string }
 */

const env = loadEnv()

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview'

const PARENT_INSTRUCTIONS = `You are PAL — a warm, witty AI money coach for families. You're onboarding a parent right now.

Your job is to collect 3 things through natural, fun conversation:
1. name — what their kids call them (e.g. "Mum", "Dad", "Sarah")
2. avatar — pick one: 👩‍🦰 👨 👩 👴 👵 🧑
3. style — their money parenting style: "chill" (relaxed, trust the kids), "balanced" (guide but don't control), or "strict" (clear rules, high standards)

How to run the conversation:
- Start with a warm, curious opener like "Hey! I'm PAL, your family's money buddy. What do your kids call you?"
- React genuinely to their answers — be warm, occasionally funny
- Ask ONE question at a time, keep it conversational
- For avatar: describe the options naturally, e.g. "Are you more of a cool mum, a dad-joke dad, or something else entirely?"
- For style: make it relatable, e.g. "When it comes to money — are you the 'figure it out yourself' type, the 'let's talk about it' type, or the 'here are the rules' type?"
- Keep each response to 1-2 short sentences. This is voice — no long speeches.
- When all 3 are collected, say something like "Perfect, I've got everything I need. Let's build your family's money world!" and include [DONE].

After EVERY response, include this on a new line (fill in what you know, null for unknown):
[PERSONA: {"name": "value or null", "avatar": "emoji or null", "style": "value or null"}]`

const KID_INSTRUCTIONS = `You are PAL — a sarcastic, hype-energy AI money buddy for kids. You're onboarding a kid right now.

Your job is to collect 4 things through a fun, punchy conversation:
1. name — what they want to be called
2. age — between 8 and 17
3. avatar — pick one: 🧒 👦 👧 🧑 🦄 🐱 🐶
4. voiceId — their vibe: "sarcastic" (dry humour), "cool" (smooth), "wise" (thoughtful), "hyped" (energy), "chill" (relaxed), "auntie" (caring)

How to run the conversation:
- Open with something like "Yo! I'm PAL. I'm basically your money brain. What do I call you?"
- Be playful, slightly sarcastic, like a cool older sibling
- React to their answers with personality — tease them a little, hype them up
- For avatar: "Pick your vibe — are you a unicorn, a cat, or just a regular human? No judgment."
- For voiceId: "How do you want me to talk to you — sarcastic, hype, chill, wise, smooth, or like your fave auntie?"
- 1-2 sentences max per response. Punchy.
- When done, say something like "Alright, let's get this money. You're all set!" and include [DONE].

After EVERY response, include this on a new line:
[PERSONA: {"name": "value or null", "age": null, "avatar": "emoji or null", "voiceId": "value or null"}]`

type SessionState = {
  role: 'parent' | 'kid'
  personaSoFar: Record<string, unknown>
  openaiWS: WebSocketClient | null
  replyBuffer: string
}

const sessions = new WeakMap<WebSocket, SessionState>()

export function onVoiceRealtimeConnect(ws: WebSocket) {
  logger.info('voice_rt.connected')
  // Note: we send session.connected here so the client can immediately
  // trigger PAL's opening line. The actual OpenAI session starts when
  // the client sends session.start.
  ws.send(JSON.stringify({ type: 'session.connected' }))
}

export async function onVoiceRealtimeMessage(ws: WebSocket, data: Buffer) {
  // Binary audio chunk [0x03][PCM16 bytes]
  if (data.length > 0 && data[0] === 0x03) {
    const state = sessions.get(ws)
    if (!state?.openaiWS || state.openaiWS.readyState !== WebSocketClient.OPEN) return
    const audioChunk = data.slice(1)
    try {
      state.openaiWS.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: audioChunk.toString('base64'),
      }))
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
  if (state?.openaiWS) {
    try { state.openaiWS.close() } catch { /* ignore */ }
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
    // Connect directly to OpenAI Realtime GA API
    const openaiWS = new WebSocketClient(OPENAI_REALTIME_URL, {
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    })

    const state: SessionState = {
      role,
      personaSoFar,
      openaiWS,
      replyBuffer: '',
    }
    sessions.set(ws, state)

    // Wait for OpenAI connection to open
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('connection_timeout')), 12_000)
      openaiWS.once('open', () => { clearTimeout(timeout); resolve() })
      openaiWS.once('error', (err) => { clearTimeout(timeout); reject(err) })
    })

    logger.info({ role }, 'voice_rt.openai_connected')

    // Configure session
    openaiWS.send(JSON.stringify({
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
        temperature: 0.8,
        max_response_output_tokens: 150,
      },
    }))

    // Inject conversation history
    for (const turn of conversation.slice(-4)) {
      openaiWS.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: turn.role,
          content: [{ type: 'input_text', text: turn.content }],
        },
      }))
    }

    // Trigger PAL to speak first if no history
    if (conversation.length === 0) {
      openaiWS.send(JSON.stringify({ type: 'response.create' }))
    }

    // ── Handle messages from OpenAI ───────────────────────────────
    openaiWS.on('message', (raw: Buffer) => {
      if (ws.readyState !== ws.OPEN) return

      let event: { type: string; [k: string]: unknown }
      try {
        event = JSON.parse(raw.toString())
      } catch {
        return
      }

      switch (event.type) {
        case 'input_audio_buffer.speech_started':
          ws.send(JSON.stringify({ type: 'speech.started' }))
          break

        case 'input_audio_buffer.speech_stopped':
          ws.send(JSON.stringify({ type: 'speech.stopped' }))
          break

        case 'conversation.item.input_audio_transcription.completed': {
          const transcript = (event.transcript as string) ?? ''
          ws.send(JSON.stringify({ type: 'transcript.done', text: transcript }))
          break
        }

        case 'response.audio_transcript.delta': {
          const delta = (event.delta as string) ?? ''
          state.replyBuffer += delta
          ws.send(JSON.stringify({ type: 'reply.delta', text: delta }))
          break
        }

        case 'response.audio.delta': {
          const audioB64 = (event.delta as string) ?? ''
          if (!audioB64) break
          const audioBytes = Buffer.from(audioB64, 'base64')
          const tagged = Buffer.alloc(1 + audioBytes.length)
          tagged[0] = 0x04
          audioBytes.copy(tagged, 1)
          ws.send(tagged)
          break
        }

        case 'response.done': {
          const fullText = state.replyBuffer
          state.replyBuffer = ''

          // Extract persona update
          const personaMatch = fullText.match(/\[PERSONA:\s*(\{[^}]+\})\]/)
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
          break
        }

        case 'error': {
          const errObj = event.error as { message?: string; code?: string } | undefined
          logger.error({ event }, 'voice_rt.openai_error')
          ws.send(JSON.stringify({ type: 'error', message: errObj?.message ?? 'Voice service error' }))
          break
        }
      }
    })

    openaiWS.on('error', (err) => {
      logger.error({ err: String(err) }, 'voice_rt.openai_ws_error')
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'Voice connection error' }))
      }
    })

    openaiWS.on('close', (code, reason) => {
      logger.info({ code, reason: reason.toString() }, 'voice_rt.openai_closed')
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
  if (!state?.openaiWS || state.openaiWS.readyState !== WebSocketClient.OPEN) return
  try {
    state.openaiWS.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
    state.openaiWS.send(JSON.stringify({ type: 'response.create' }))
  } catch (err) {
    logger.warn({ err: String(err) }, 'voice_rt.audio_end_failed')
  }
}

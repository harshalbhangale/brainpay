import WebSocket from 'ws'
import { logger } from '../logger'

/**
 * Voice onboarding relay — connects the mobile client to OpenAI Realtime API.
 *
 * Protocol:
 *   Client → Server: raw PCM16 audio chunks (binary) or JSON control messages
 *   Server → Client: raw PCM16 audio chunks (binary) or JSON events
 *
 * The server maintains a WebSocket to OpenAI Realtime API and relays
 * audio bidirectionally. It also intercepts function calls from OpenAI
 * (e.g., save_persona) and executes them server-side.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview'

const SYSTEM_PROMPT = `You are PAL, a friendly AI money buddy for families. You're onboarding a new parent into the BrainPay app.

Your personality: warm, slightly cheeky, concise. Never boring. Keep every response to 1-2 sentences max.

Your job in this conversation:
1. Greet them warmly. Introduce yourself in one sentence. Then ask their name.
2. Once you have their name, react positively (use their name). Then ask them to pick an avatar — tell them the options are: 👩‍🦰 👨 👩 👴 👵 🧑 (describe them as "a few face options on screen").
3. After they pick (they'll say something like "the first one" or "the woman"), acknowledge it. Then ask: "Last one — when your kid scans junk food, how savage should I be? Chill, balanced, or strict?"
4. When they pick a style, demo it briefly (one example sentence in that style about a kid buying a $5 energy drink). Then confirm: "Got it. You're [name], [style] vibes. Let's set up your family."
5. Call the save_persona function with the gathered info.

Rules:
- Keep it SHORT. This should feel like a 30-second chat, not an interview.
- If the user says something unexpected, roll with it. Be human.
- Don't repeat yourself. Don't over-explain.
- If the user says "skip" or seems impatient, speed through remaining questions.
- ALWAYS call save_persona when you have all three pieces of info (name, avatar, style).`

const TOOLS = [
  {
    type: 'function' as const,
    name: 'save_persona',
    description: 'Save the parent persona when all info is gathered (name, avatar, style)',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Parent display name' },
        avatar: { type: 'string', description: 'Chosen avatar emoji' },
        style: {
          type: 'string',
          enum: ['chill', 'balanced', 'strict'],
          description: 'Parenting style for PAL responses',
        },
      },
      required: ['name', 'avatar', 'style'],
    },
  },
]

type ClientState = {
  openaiWs: WebSocket | null
  accountId: string | null
  closed: boolean
}

export function handleVoiceOnboard(clientWs: WebSocket, accountId: string | null) {
  const state: ClientState = { openaiWs: null, accountId, closed: false }

  if (!OPENAI_API_KEY) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'openai_not_configured' }))
    clientWs.close()
    return
  }

  // Connect to OpenAI Realtime API
  const openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  })
  state.openaiWs = openaiWs

  openaiWs.on('open', () => {
    logger.info({ accountId }, 'voice_onboard.openai_connected')

    // Configure the session
    openaiWs.send(JSON.stringify({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: SYSTEM_PROMPT,
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
        },
        tools: TOOLS,
        tool_choice: 'auto',
      },
    }))

    // Send initial greeting trigger
    openaiWs.send(JSON.stringify({
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
        instructions: 'Greet the user and ask their name. Keep it to 2 sentences.',
      },
    }))

    // Tell client we're ready
    clientWs.send(JSON.stringify({ type: 'session.ready' }))
  })

  // Relay OpenAI events to client
  openaiWs.on('message', (data) => {
    if (state.closed) return
    try {
      const event = JSON.parse(data.toString())

      switch (event.type) {
        case 'response.audio.delta':
          // Send audio chunk to client as binary
          if (event.delta) {
            const audioBuffer = Buffer.from(event.delta, 'base64')
            clientWs.send(audioBuffer)
          }
          break

        case 'response.audio.done':
          clientWs.send(JSON.stringify({ type: 'audio.done' }))
          break

        case 'response.text.delta':
          // Send transcript for subtitles
          clientWs.send(JSON.stringify({
            type: 'transcript.delta',
            text: event.delta,
          }))
          break

        case 'response.text.done':
          clientWs.send(JSON.stringify({
            type: 'transcript.done',
            text: event.text,
          }))
          break

        case 'input_audio_buffer.speech_started':
          clientWs.send(JSON.stringify({ type: 'user.speaking' }))
          break

        case 'input_audio_buffer.speech_stopped':
          clientWs.send(JSON.stringify({ type: 'user.stopped' }))
          break

        case 'conversation.item.input_audio_transcription.completed':
          clientWs.send(JSON.stringify({
            type: 'user.transcript',
            text: event.transcript,
          }))
          break

        case 'response.function_call_arguments.done':
          handleFunctionCall(clientWs, state, event)
          break

        case 'error':
          logger.error({ error: event.error }, 'voice_onboard.openai_error')
          clientWs.send(JSON.stringify({ type: 'error', message: event.error?.message ?? 'openai_error' }))
          break
      }
    } catch (err) {
      logger.warn({ err: String(err) }, 'voice_onboard.parse_failed')
    }
  })

  openaiWs.on('error', (err) => {
    logger.error({ err: String(err) }, 'voice_onboard.openai_ws_error')
    if (!state.closed) {
      clientWs.send(JSON.stringify({ type: 'error', message: 'connection_failed' }))
      clientWs.close()
    }
  })

  openaiWs.on('close', () => {
    logger.info({ accountId }, 'voice_onboard.openai_disconnected')
    if (!state.closed) {
      clientWs.send(JSON.stringify({ type: 'session.ended' }))
      clientWs.close()
    }
  })

  // Handle messages from client
  clientWs.on('message', (data) => {
    if (state.closed) return
    if (!state.openaiWs || state.openaiWs.readyState !== WebSocket.OPEN) return

    // Binary = audio from mic
    if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
      state.openaiWs.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: buffer.toString('base64'),
      }))
      return
    }

    // JSON control messages
    try {
      const msg = JSON.parse(data.toString())
      switch (msg.type) {
        case 'interrupt':
          state.openaiWs.send(JSON.stringify({ type: 'response.cancel' }))
          break
        case 'input.commit':
          state.openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
          break
        case 'avatar.selected':
          // Inject context about avatar selection
          state.openaiWs.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: `I picked the ${msg.avatar} avatar.` }],
            },
          }))
          state.openaiWs.send(JSON.stringify({ type: 'response.create' }))
          break
        case 'style.selected':
          // Inject context about style selection
          state.openaiWs.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: `I'll go with ${msg.style}.` }],
            },
          }))
          state.openaiWs.send(JSON.stringify({ type: 'response.create' }))
          break
      }
    } catch {
      // Not JSON, ignore
    }
  })

  clientWs.on('close', () => {
    state.closed = true
    if (state.openaiWs && state.openaiWs.readyState === WebSocket.OPEN) {
      state.openaiWs.close()
    }
    logger.info({ accountId }, 'voice_onboard.client_disconnected')
  })
}

async function handleFunctionCall(clientWs: WebSocket, state: ClientState, event: {
  call_id: string
  name: string
  arguments: string
}) {
  if (event.name === 'save_persona') {
    try {
      const args = JSON.parse(event.arguments) as {
        name: string
        avatar: string
        style: string
      }

      // Tell client the persona was captured
      clientWs.send(JSON.stringify({
        type: 'persona.saved',
        persona: args,
      }))

      // Tell OpenAI the function succeeded so it can speak the outro
      state.openaiWs?.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: event.call_id,
          output: JSON.stringify({ success: true }),
        },
      }))
      state.openaiWs?.send(JSON.stringify({ type: 'response.create' }))

    } catch (err) {
      logger.error({ err: String(err) }, 'voice_onboard.save_persona_failed')
    }
  }
}

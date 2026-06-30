import type { WebSocket } from 'ws'
import type { Session, LiveServerMessage } from '@google/genai'
import { connectLiveSession, type LiveMode, type InterviewContext } from '../services/gemini-live'
import { streamTts } from '../services/elevenlabs-tts'
import { resolveVoiceId } from '../services/voices'
import { loadEnv } from '../env'
import { logger } from '../logger'

const env = loadEnv()
const USE_ELEVEN = env.COMPANION_VOICE_PROVIDER === 'elevenlabs'

/**
 * Gemini Live bridge — /live-rt
 *
 * Bridges a mobile client ↔ one Vertex Gemini Live session. This is the
 * "Grok Speak + camera" experience: live video + mic in, PAL voice +
 * transcript + item detections out, with mic/speaker mute toggles.
 *
 * Protocol (client → server):
 *   { type: 'session.start', role: 'parent'|'kid', mode?: 'shop'|'assist' }
 *   Binary [0x01][JPEG bytes]   — camera frame
 *   Binary [0x03][PCM16 bytes]  — mic audio chunk (16 kHz mono)
 *   { type: 'mic', on: boolean }      — mute/unmute microphone
 *   { type: 'speaker', on: boolean }  — mute/unmute PAL audio
 *   { type: 'interrupt' }
 *   { type: 'session.end' }
 *
 * Protocol (server → client):
 *   { type: 'session.connected' }
 *   { type: 'transcript.user', text }      — what the user said
 *   { type: 'reply.delta', text }          — PAL's spoken words (transcript)
 *   { type: 'turn.complete' }
 *   { type: 'interrupted' }                — barge-in; client should stop audio
 *   { type: 'detection', detectionId, name, category, coinDelta, emoji, confidence }
 *   Binary [0x04][PCM16 bytes]             — PAL audio chunk (24 kHz mono)
 *   { type: 'error', message }
 */

const TAG_FRAME = 0x01
const TAG_MIC_AUDIO = 0x03
const TAG_OUT_AUDIO = 0x04

type SessionState = {
  live: Session | null
  micOn: boolean
  speakerOn: boolean
  starting: boolean
  mode: LiveMode
  persona?: Record<string, unknown>
  // Voice override for this session (e.g. tutor voice for interviews).
  voiceId?: string
  // ElevenLabs TTS pipeline (companion voice).
  ttsBuf: string
  ttsGen: number
  ttsChain: Promise<void>
  ttsAbort: AbortController | null
}

const TAG_OUT_MP3 = 0x05

const sessions = new WeakMap<WebSocket, SessionState>()

function emojiFor(category: string): string {
  const c = category.toLowerCase()
  if (c.includes('drink') || c.includes('beverage') || c.includes('soda')) return '🥤'
  if (c.includes('snack') || c.includes('candy') || c.includes('chocolate') || c.includes('cookie')) return '🍫'
  if (c.includes('dairy') || c.includes('milk') || c.includes('yogurt')) return '🥛'
  if (c.includes('fruit') || c.includes('produce') || c.includes('vegetable')) return '🍎'
  if (c.includes('meal') || c.includes('food')) return '🍱'
  if (c.includes('electronics') || c.includes('tech') || c.includes('phone') || c.includes('laptop')) return '📱'
  if (c.includes('book') || c.includes('magazine')) return '📖'
  if (c.includes('toy') || c.includes('game') || c.includes('lego') || c.includes('plush')) return '🧸'
  if (c.includes('clothing') || c.includes('clothes') || c.includes('shoe')) return '👕'
  if (c.includes('stationery') || c.includes('pen') || c.includes('pencil')) return '✏️'
  if (c.includes('household') || c.includes('cleaning')) return '🏠'
  if (c.includes('sport') || c.includes('ball')) return '⚽'
  return '🛒'
}

function send(ws: WebSocket, obj: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj))
}

export function onGeminiLiveConnect(ws: WebSocket) {
  sessions.set(ws, {
    live: null,
    micOn: true,
    speakerOn: true,
    starting: false,
    mode: 'shop',
    ttsBuf: '',
    ttsGen: 0,
    ttsChain: Promise.resolve(),
    ttsAbort: null,
  })
  logger.info('gemini_live.connected')
  send(ws, { type: 'session.connected' })
}

/** Stop any in-flight speech and drop queued audio (barge-in / new turn). */
function cancelSpeech(state: SessionState) {
  state.ttsGen++
  state.ttsBuf = ''
  try {
    state.ttsAbort?.abort()
  } catch {
    /* ignore */
  }
  state.ttsAbort = null
}

/** Synthesise one sentence and stream its MP3 to the client, in order. */
function speakSentence(ws: WebSocket, state: SessionState, text: string) {
  const sentence = text.trim()
  if (!sentence) return
  const gen = state.ttsGen
  state.ttsChain = state.ttsChain
    .then(async () => {
      if (gen !== state.ttsGen || !state.speakerOn) return
      const ac = new AbortController()
      state.ttsAbort = ac
      const parts: Buffer[] = []
      try {
        await streamTts(sentence, (c) => parts.push(c), ac.signal, state.voiceId)
      } catch {
        /* aborted or failed */
      }
      if (gen !== state.ttsGen || !state.speakerOn) return
      const mp3 = Buffer.concat(parts)
      if (mp3.length && ws.readyState === ws.OPEN) {
        const tagged = Buffer.alloc(1 + mp3.length)
        tagged[0] = TAG_OUT_MP3
        mp3.copy(tagged, 1)
        ws.send(tagged)
        logger.info({ bytes: mp3.length, chars: sentence.length }, 'tts.spoke')
      } else if (!mp3.length) {
        logger.warn({ chars: sentence.length }, 'tts.empty')
      }
    })
    .catch(() => undefined)
}

/** Buffer streamed text; flush complete sentences to TTS as they form. */
function pushText(ws: WebSocket, state: SessionState, delta: string) {
  state.ttsBuf += delta
  for (;;) {
    const m = state.ttsBuf.match(/[.!?…]+["')\]]*(\s|$)/)
    if (!m) break
    const end = (m.index ?? 0) + m[0].length
    const sentence = state.ttsBuf.slice(0, end)
    state.ttsBuf = state.ttsBuf.slice(end)
    speakSentence(ws, state, sentence)
  }
}

export async function onGeminiLiveMessage(ws: WebSocket, data: Buffer) {
  const state = sessions.get(ws)
  if (!state) return

  // ── Binary paths ───────────────────────────────────────────────────
  if (data.length > 0 && data[0] === TAG_FRAME) {
    if (!state.live) return
    const jpeg = data.subarray(1)
    try {
      state.live.sendRealtimeInput({
        video: { data: jpeg.toString('base64'), mimeType: 'image/jpeg' },
      })
    } catch (err) {
      logger.warn({ err: String(err) }, 'gemini_live.frame_failed')
    }
    return
  }

  if (data.length > 0 && data[0] === TAG_MIC_AUDIO) {
    if (!state.live || !state.micOn) return // dropped while muted
    const pcm = data.subarray(1)
    try {
      state.live.sendRealtimeInput({
        audio: { data: pcm.toString('base64'), mimeType: 'audio/pcm;rate=16000' },
      })
    } catch (err) {
      logger.warn({ err: String(err) }, 'gemini_live.audio_failed')
    }
    return
  }

  // ── JSON control path ────────────────────────────────────────────────
  let msg: { type?: string; [k: string]: unknown }
  try {
    msg = JSON.parse(data.toString())
  } catch {
    return
  }

  switch (msg.type) {
    case 'session.start':
      await handleStart(
        ws,
        state,
        (msg.role as 'parent' | 'kid') ?? 'kid',
        (['assist', 'shop', 'onboard_parent', 'onboard_kid', 'interview'].includes(msg.mode as string)
          ? (msg.mode as LiveMode)
          : 'shop'),
        (msg.persona as Record<string, unknown> | undefined),
        (msg.interview as InterviewContext | undefined),
        (msg.voice as string | undefined),
      )
      break
    case 'mic':
      state.micOn = msg.on !== false
      break
    case 'text': {
      // Typed user turn (onboarding "type instead", or any text reply). Inject
      // it as a user turn so PAL responds exactly as it would to speech.
      const text = typeof msg.text === 'string' ? msg.text.trim() : ''
      if (text && state.live) {
        if (USE_ELEVEN) cancelSpeech(state)
        send(ws, { type: 'transcript.user', text })
        try {
          state.live.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true })
        } catch (err) {
          logger.warn({ err: String(err) }, 'live.text_failed')
        }
      }
      break
    }
    case 'speaker':
      state.speakerOn = msg.on !== false
      if (!state.speakerOn && USE_ELEVEN) cancelSpeech(state)
      break
    case 'interrupt':
      // Explicit client tap: stop speaking now + drop queued audio.
      if (USE_ELEVEN) cancelSpeech(state)
      send(ws, { type: 'interrupted' })
      break
    case 'session.end':
      ws.close()
      break
  }
}

async function handleStart(ws: WebSocket, state: SessionState, role: 'parent' | 'kid', mode: LiveMode, persona?: Record<string, unknown>, interview?: InterviewContext, voice?: string) {
  if (state.live || state.starting) return
  state.starting = true
  state.mode = mode
  state.persona = persona
  // Interviews use the warm tutor voice; otherwise honor the user's choice.
  if (mode === 'interview') state.voiceId = env.ELEVENLABS_TUTOR_VOICE_ID ?? 'pFZP5JQG7iQjIQuC4Bku'
  else if (voice) state.voiceId = resolveVoiceId(voice)
  try {
    state.live = await connectLiveSession(role, mode, {
      onmessage: (m) => handleLiveMessage(ws, state, m),
      onerror: (e) => {
        logger.error({ err: e?.message ?? String(e) }, 'gemini_live.session_error')
        send(ws, { type: 'error', message: 'Live session error' })
      },
      onclose: (e) => {
        logger.info({ reason: e?.reason }, 'gemini_live.session_closed')
      },
    }, persona as Parameters<typeof connectLiveSession>[3], interview)
    logger.info({ role, mode }, 'gemini_live.session_started')
    // Modes where the assistant speaks first — kick off the greeting + first question.
    if (mode === 'onboard_parent' || mode === 'onboard_kid') {
      try {
        state.live.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: '(Onboarding just started. Warmly greet me and ask your very first question now.)' }] }],
          turnComplete: true,
        })
      } catch (err) {
        logger.warn({ err: String(err) }, 'onboard.kickoff_failed')
      }
    } else if (mode === 'interview') {
      try {
        state.live.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: '(The interview is starting. Warmly greet me by name if you know it, then ask your first question now.)' }] }],
          turnComplete: true,
        })
      } catch (err) {
        logger.warn({ err: String(err) }, 'interview.kickoff_failed')
      }
    }
  } catch (err) {
    logger.error({ err: String(err) }, 'gemini_live.start_failed')
    send(ws, { type: 'error', message: 'Could not start live session' })
  } finally {
    state.starting = false
  }
}

function handleLiveMessage(ws: WebSocket, state: SessionState, m: LiveServerMessage) {
  // Tool calls — surface structured detections + ack back to the model.
  const calls = m.toolCall?.functionCalls
  if (calls?.length) {
    const responses = []
    for (const call of calls) {
      if (call.name === 'report_item') {
        const args = (call.args ?? {}) as {
          name?: string
          category?: string
          verdict?: string
          healthNote?: string
          budgetNote?: string
          facts?: string[]
          anchor?: { x?: number; y?: number }
          estimatedPrice?: string
          healthScore?: number
          confidence?: number
        }
        const category = args.category ?? ''
        const verdict = ['great', 'okay', 'avoid'].includes(args.verdict ?? '')
          ? (args.verdict as 'great' | 'okay' | 'avoid')
          : (args.healthScore ?? 0) >= 5
            ? 'great'
            : (args.healthScore ?? 0) <= -5
              ? 'avoid'
              : 'okay'
        const ax = typeof args.anchor?.x === 'number' ? Math.max(0, Math.min(1, args.anchor.x)) : null
        const ay = typeof args.anchor?.y === 'number' ? Math.max(0, Math.min(1, args.anchor.y)) : null
        send(ws, {
          type: 'detection',
          detectionId: crypto.randomUUID(),
          name: args.name ?? 'item',
          category,
          verdict,
          healthNote: args.healthNote ?? '',
          budgetNote: args.budgetNote ?? '',
          facts: Array.isArray(args.facts) ? args.facts.slice(0, 4).map((f) => String(f)) : [],
          anchor: ax !== null && ay !== null ? { x: ax, y: ay } : null,
          coinDelta: Math.round(args.healthScore ?? 0),
          emoji: emojiFor(category),
          estimatedPrice: args.estimatedPrice ?? '',
          confidence: args.confidence ?? 0,
        })
      }
      if (call.name === 'save_persona') {
        send(ws, { type: 'persona.saved', persona: (call.args ?? {}) as Record<string, unknown> })
        logger.info('onboard.persona_saved')
      }
      if (call.name === 'score_interview') {
        const a = (call.args ?? {}) as { score?: number; summary?: string; keepPractising?: string[] }
        const score = Math.max(1, Math.min(10, Math.round(a.score ?? 5)))
        send(ws, {
          type: 'interview.scored',
          score,
          summary: a.summary ?? '',
          keepPractising: Array.isArray(a.keepPractising) ? a.keepPractising.slice(0, 3).map(String) : [],
        })
        logger.info({ score }, 'interview.scored')
      }
      responses.push({ id: call.id, name: call.name ?? 'report_item', response: { result: 'ok' } })
    }
    try {
      state.live?.sendToolResponse({ functionResponses: responses })
    } catch (err) {
      logger.warn({ err: String(err) }, 'gemini_live.tool_response_failed')
    }
  }

  const sc = m.serverContent
  if (!sc) return

  if (sc.interrupted) {
    if (USE_ELEVEN) cancelSpeech(state)
    send(ws, { type: 'interrupted' })
  }

  if (sc.inputTranscription?.text) {
    send(ws, { type: 'transcript.user', text: sc.inputTranscription.text })
  }

  // Gemini audio path: forward its spoken transcript as captions.
  if (sc.outputTranscription?.text) {
    send(ws, { type: 'reply.delta', text: sc.outputTranscription.text })
  }

  // Collect the model's TEXT (ElevenLabs path) or AUDIO (Gemini path) parts.
  const parts = sc.modelTurn?.parts ?? []
  for (const part of parts) {
    if (USE_ELEVEN) {
      if (part.text) {
        send(ws, { type: 'reply.delta', text: part.text })
        if (state.speakerOn) pushText(ws, state, part.text)
      }
    } else if (state.speakerOn) {
      const inline = part.inlineData
      if (inline?.data && inline.mimeType?.startsWith('audio/')) {
        const pcm = Buffer.from(inline.data, 'base64')
        const tagged = Buffer.alloc(1 + pcm.length)
        tagged[0] = TAG_OUT_AUDIO
        pcm.copy(tagged, 1)
        if (ws.readyState === ws.OPEN) ws.send(tagged)
      }
    }
  }

  if (sc.turnComplete) {
    // Flush any trailing text without sentence punctuation.
    if (USE_ELEVEN && state.ttsBuf.trim()) {
      const tail = state.ttsBuf
      state.ttsBuf = ''
      speakSentence(ws, state, tail)
    }
    send(ws, { type: 'turn.complete' })
  }
}

export function onGeminiLiveClose(ws: WebSocket) {
  const state = sessions.get(ws)
  if (state?.live) {
    try {
      state.live.close()
    } catch {
      /* ignore */
    }
  }
  sessions.delete(ws)
  logger.info('gemini_live.closed')
}

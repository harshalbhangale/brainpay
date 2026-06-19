import type { WebSocket } from 'ws'
import type { Session, LiveServerMessage } from '@google/genai'
import { connectLiveSession, type LiveMode } from '../services/gemini-live'
import { logger } from '../logger'

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
}

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
  sessions.set(ws, { live: null, micOn: true, speakerOn: true, starting: false, mode: 'shop' })
  logger.info('gemini_live.connected')
  send(ws, { type: 'session.connected' })
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
        msg.mode === 'assist' ? 'assist' : 'shop',
      )
      break
    case 'mic':
      state.micOn = msg.on !== false
      break
    case 'speaker':
      state.speakerOn = msg.on !== false
      break
    case 'interrupt':
      // Gemini handles barge-in automatically when mic audio arrives; this is
      // an explicit client tap. No-op server-side beyond telling client to stop.
      send(ws, { type: 'interrupted' })
      break
    case 'session.end':
      ws.close()
      break
  }
}

async function handleStart(ws: WebSocket, state: SessionState, role: 'parent' | 'kid', mode: LiveMode) {
  if (state.live || state.starting) return
  state.starting = true
  state.mode = mode
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
    })
    logger.info({ role, mode }, 'gemini_live.session_started')
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
        send(ws, {
          type: 'detection',
          detectionId: crypto.randomUUID(),
          name: args.name ?? 'item',
          category,
          verdict,
          healthNote: args.healthNote ?? '',
          budgetNote: args.budgetNote ?? '',
          estimatedPrice: args.estimatedPrice ?? '',
          coinDelta: Math.round(args.healthScore ?? 0),
          emoji: emojiFor(category),
          confidence: args.confidence ?? 0,
        })
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
    send(ws, { type: 'interrupted' })
  }

  if (sc.inputTranscription?.text) {
    send(ws, { type: 'transcript.user', text: sc.inputTranscription.text })
  }
  if (sc.outputTranscription?.text) {
    send(ws, { type: 'reply.delta', text: sc.outputTranscription.text })
  }

  // PAL audio out — PCM16 @ 24 kHz. Skip entirely when speaker muted.
  if (state.speakerOn) {
    const parts = sc.modelTurn?.parts ?? []
    for (const part of parts) {
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

import type { WebSocket } from 'ws'
import WebSocketClient from 'ws'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { callSessions } from '../db/schema'
import { logger } from '../logger'
import { loadEnv } from '../env'
import {
  VOICE_TOOLS,
  resolveCallerParent,
  toolFindChild,
  toolCreateTask,
} from '../services/voice-tools'

/**
 * Twilio Media Stream ↔ OpenAI Realtime bridge (GA `gpt-realtime`).
 *
 * Aligned with the official twilio-samples speech-assistant-openai-realtime
 * reference. Both sides speak G.711 μ-law (audio/pcmu) so audio relays
 * verbatim with no resampling.
 *
 * Includes barge-in interruption handling: when the caller starts talking
 * while PAL is speaking, we truncate PAL's in-flight item and clear Twilio's
 * playback buffer, using mark-queue timing to compute the cut point.
 *
 * Money safety unchanged: voice can only CREATE tasks (status 'pending').
 * Wallet credit happens only via the existing chore approval → payout path.
 */

const env = loadEnv()
const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-realtime'
const VOICE = 'alloy'

type CallState = {
  streamSid: string | null
  callSid: string | null
  fromPhone: string
  parent: { accountId: string; familyId: string; name: string } | null
  sessionRowId: string | null
  openaiWS: WebSocketClient | null
  // Interruption timing
  latestMediaTs: number
  lastAssistantItem: string | null
  responseStartTs: number | null
  markQueue: string[]
}

const calls = new WeakMap<WebSocket, CallState>()

function instructions(parentName: string, hasFamily: boolean): string {
  if (!hasFamily) {
    return `You are PAL, BrainPal's phone assistant. The caller's number is not linked to a parent account with a family. Politely tell them you can't find their account, ask them to set up BrainPal in the app first, and end the call warmly. Do not call any tools.`
  }
  return `You are PAL, BrainPal's friendly family task assistant on a phone call with ${parentName}, a verified parent.

Your job: help them create a task (chore) for one of their children, by voice.

How to run the call:
- Greet ${parentName} warmly and briefly.
- Find out: which child, what the task is, and the reward amount.
- Reward is in dollars on the call; convert to Brain Points as dollars × 100 (e.g. $5 → 500).
- Use the find_child tool to resolve the child by name BEFORE creating a task. If it returns multiple options, ask which one.
- Confirm the task title and reward out loud before calling create_task.
- After create_task succeeds, tell them it's done and that a text confirmation is on the way.
- Keep every spoken response to 1-2 short sentences. This is a phone call.
- You can ONLY create tasks. You cannot move money or pay rewards — payment happens when the child completes the task and the parent approves in the app. If asked to send money, explain this.`
}

export function onTwilioMediaConnect(ws: WebSocket) {
  calls.set(ws, {
    streamSid: null,
    callSid: null,
    fromPhone: '',
    parent: null,
    sessionRowId: null,
    openaiWS: null,
    latestMediaTs: 0,
    lastAssistantItem: null,
    responseStartTs: null,
    markQueue: [],
  })
  logger.info('twilio_media.connected')
}

export async function onTwilioMediaMessage(ws: WebSocket, data: Buffer) {
  let msg: { event?: string; [k: string]: unknown }
  try {
    msg = JSON.parse(data.toString())
  } catch {
    return
  }

  const state = calls.get(ws)
  if (!state) return

  switch (msg.event) {
    case 'start': {
      const start = msg.start as {
        streamSid: string
        callSid: string
        customParameters?: { from?: string; callSid?: string }
      }
      state.streamSid = start.streamSid
      state.callSid = start.callSid ?? start.customParameters?.callSid ?? null
      state.fromPhone = start.customParameters?.from ?? ''
      state.responseStartTs = null
      state.latestMediaTs = 0
      await beginSession(ws, state)
      break
    }

    case 'media': {
      const media = msg.media as { payload: string; timestamp: string }
      state.latestMediaTs = parseInt(media.timestamp ?? '0', 10) || state.latestMediaTs
      const oai = state.openaiWS
      if (oai && oai.readyState === WebSocketClient.OPEN && media?.payload) {
        oai.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: media.payload }))
      }
      break
    }

    case 'mark': {
      if (state.markQueue.length > 0) state.markQueue.shift()
      break
    }

    case 'stop': {
      await endSession(ws, state)
      break
    }
  }
}

export async function onTwilioMediaClose(ws: WebSocket) {
  const state = calls.get(ws)
  if (state) await endSession(ws, state)
  calls.delete(ws)
  logger.info('twilio_media.closed')
}

// ─── Open OpenAI Realtime session + write call_sessions row ───────────
async function beginSession(ws: WebSocket, state: CallState) {
  state.parent = state.fromPhone ? await resolveCallerParent(state.fromPhone) : null

  try {
    const [row] = await db
      .insert(callSessions)
      .values({
        accountId: state.parent?.accountId ?? null,
        fromPhone: state.fromPhone || 'unknown',
        twilioCallSid: state.callSid,
        status: 'active',
      } as any)
      .returning({ id: callSessions.id })
    state.sessionRowId = row?.id ?? null
  } catch (err) {
    logger.warn({ err: String(err) }, 'twilio_media.session_row_failed')
  }

  const openaiWS = new WebSocketClient(OPENAI_REALTIME_URL, {
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
  })
  state.openaiWS = openaiWS

  openaiWS.on('open', () => {
    // GA session shape: nested audio.input/output, output_modalities, tools at session level.
    openaiWS.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          output_modalities: ['audio'],
          audio: {
            input: {
              format: { type: 'audio/pcmu' },
              turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 700 },
              transcription: { model: 'whisper-1' },
            },
            output: {
              format: { type: 'audio/pcmu' },
              voice: VOICE,
            },
          },
          instructions: instructions(state.parent?.name ?? 'there', !!state.parent),
          tools: state.parent ? (VOICE_TOOLS as unknown as unknown[]) : [],
          tool_choice: 'auto',
        },
      }),
    )

    // PAL speaks first — seed a greeting then ask for a response.
    openaiWS.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Start the call: greet me briefly and ask how you can help with a task.' }],
        },
      }),
    )
    openaiWS.send(JSON.stringify({ type: 'response.create' }))
  })

  openaiWS.on('message', (raw: Buffer) => handleOpenAiEvent(ws, state, raw))
  openaiWS.on('error', (err) => logger.error({ err: String(err) }, 'twilio_media.openai_error'))
  openaiWS.on('close', () => logger.info('twilio_media.openai_closed'))
}

// ─── Relay OpenAI events back to Twilio + handle tools + barge-in ─────
async function handleOpenAiEvent(ws: WebSocket, state: CallState, raw: Buffer) {
  let event: { type: string; [k: string]: unknown }
  try {
    event = JSON.parse(raw.toString())
  } catch {
    return
  }

  switch (event.type) {
    // GA audio output event.
    case 'response.output_audio.delta': {
      const audio = event.delta as string
      if (audio && state.streamSid && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ event: 'media', streamSid: state.streamSid, media: { payload: audio } }))

        if (state.responseStartTs == null) state.responseStartTs = state.latestMediaTs
        if (event.item_id) state.lastAssistantItem = event.item_id as string

        // Mark so we can track playback completion for interruption timing.
        ws.send(JSON.stringify({ event: 'mark', streamSid: state.streamSid, mark: { name: 'responsePart' } }))
        state.markQueue.push('responsePart')
      }
      break
    }

    // Caller started talking — barge in: truncate PAL + clear Twilio buffer.
    case 'input_audio_buffer.speech_started':
      handleBargeIn(ws, state)
      break

    // Transcripts for the call_sessions audit log.
    case 'conversation.item.input_audio_transcription.completed':
      appendTranscript(state, 'user', (event.transcript as string) ?? '')
      break

    case 'response.output_audio_transcript.done':
      appendTranscript(state, 'assistant', (event.transcript as string) ?? '')
      break

    // Tool call (function calling) — GA emits this when args are complete.
    case 'response.function_call_arguments.done':
      await handleToolCall(state, event)
      break

    case 'error':
      logger.error({ event }, 'twilio_media.openai_event_error')
      break
  }
}

// ─── Barge-in: cut PAL off cleanly when the caller speaks ─────────────
function handleBargeIn(ws: WebSocket, state: CallState) {
  const oai = state.openaiWS
  if (state.markQueue.length > 0 && state.responseStartTs != null && state.lastAssistantItem) {
    const elapsed = Math.max(0, state.latestMediaTs - state.responseStartTs)
    if (oai && oai.readyState === WebSocketClient.OPEN) {
      oai.send(
        JSON.stringify({
          type: 'conversation.item.truncate',
          item_id: state.lastAssistantItem,
          content_index: 0,
          audio_end_ms: elapsed,
        }),
      )
    }
    if (state.streamSid && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ event: 'clear', streamSid: state.streamSid }))
    }
    state.markQueue = []
    state.lastAssistantItem = null
    state.responseStartTs = null
  }
}

// ─── Tool dispatch ────────────────────────────────────────────────────
async function handleToolCall(state: CallState, event: { [k: string]: unknown }) {
  const name = event.name as string
  const callId = event.call_id as string
  const oai = state.openaiWS
  if (!oai || oai.readyState !== WebSocketClient.OPEN || !state.parent) return

  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse((event.arguments as string) ?? '{}')
  } catch { /* ignore */ }

  let output: unknown = { error: 'unknown_tool' }

  if (name === 'find_child') {
    output = await toolFindChild(state.parent.familyId, String(args.query ?? ''))
  } else if (name === 'create_task') {
    output = await toolCreateTask({
      parentId: state.parent.accountId,
      parentName: state.parent.name,
      familyId: state.parent.familyId,
      childId: String(args.childId ?? ''),
      title: String(args.title ?? ''),
      rewardBrains: Number(args.rewardBrains ?? 0),
    })
  }

  oai.send(
    JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
    }),
  )
  oai.send(JSON.stringify({ type: 'response.create' }))
}

function appendTranscript(state: CallState, role: 'user' | 'assistant', content: string) {
  if (!content.trim() || !state.sessionRowId) return
  db.transaction(async (tx) => {
    const [row] = await tx
      .select({ transcript: callSessions.transcript })
      .from(callSessions)
      .where(eq(callSessions.id, state.sessionRowId!))
      .for('update')
    const arr = Array.isArray(row?.transcript) ? (row!.transcript as unknown[]) : []
    arr.push({ role, content })
    await tx.update(callSessions).set({ transcript: arr } as any).where(eq(callSessions.id, state.sessionRowId!))
  }).catch(() => undefined)
}

async function endSession(ws: WebSocket, state: CallState) {
  try { state.openaiWS?.close() } catch { /* ignore */ }
  state.openaiWS = null
  if (state.sessionRowId) {
    await db
      .update(callSessions)
      .set({ status: 'ended', endedAt: new Date() } as any)
      .where(eq(callSessions.id, state.sessionRowId))
      .catch(() => undefined)
  }
}

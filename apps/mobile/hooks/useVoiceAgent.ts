import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  createAudioPlayer,
  type AudioPlayer,
} from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import { api } from '@/lib/api'
import {
  configureAudioForPlayback,
  configureAudioForRecording,
  requestMicPermission,
} from '@/lib/audio-mode'

/**
 * useVoiceAgent — drives a hands-free real-time voice conversation.
 *
 * Flow:
 *   1. Mount → request mic permission
 *   2. Call greet() → PAL plays opening line
 *   3. After PAL finishes speaking, mic auto-starts
 *   4. Voice activity detection: when user pauses for ~1.5s, stop recording
 *   5. POST audio → API returns transcript + reply + new audio + persona update
 *   6. PAL plays response → mic auto-restarts
 *   7. When server sets done=true → loop ends, onComplete(persona) fires
 *
 * Exposes:
 *   phase: 'idle' | 'greeting' | 'listening' | 'thinking' | 'speaking' | 'done'
 *   level: 0..1 audio level for waveform visualization
 *   transcript: most recent user transcript
 *   conversation: full message history (for chat bubble UI)
 *   persona: persona built up so far
 *   start(role) / stop() controls
 */

export type VoicePhase =
  | 'idle'
  | 'greeting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'done'
  | 'no_permission'
  | 'error'

export type ChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

type Options = {
  role: 'parent' | 'kid'
  onComplete: (persona: Record<string, unknown>) => void
  /** Silence threshold in dB. expo-audio meters from -160 (quiet) to 0 (loud). */
  silenceDb?: number
  /** How long below threshold before stopping recording, in ms. */
  silenceTimeoutMs?: number
  /** Min recording duration before VAD can stop, in ms. */
  minRecordingMs?: number
  /** Max recording duration, in ms. */
  maxRecordingMs?: number
}

export function useVoiceAgent({
  role,
  onComplete,
  silenceDb = -50,
  silenceTimeoutMs = 1500,
  minRecordingMs = 800,
  maxRecordingMs = 15_000,
}: Options) {
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [transcript, setTranscript] = useState('')
  const [conversation, setConversation] = useState<ChatTurn[]>([])
  const [persona, setPersona] = useState<Record<string, unknown>>({})
  const [level, setLevel] = useState(0)

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true })
  const recState = useAudioRecorderState(recorder, 100)

  const playerRef = useRef<AudioPlayer | null>(null)
  const silenceStartRef = useRef<number | null>(null)
  const recordingStartRef = useRef<number>(0)
  const stoppingRef = useRef(false)
  const completedRef = useRef(false)
  const personaRef = useRef<Record<string, unknown>>({})
  const conversationRef = useRef<ChatTurn[]>([])

  // ── Mic permission check on mount ─────────────────────────────────
  useEffect(() => {
    requestMicPermission().then((ok) => {
      if (!ok) setPhase('no_permission')
    })
    return () => {
      try { playerRef.current?.remove() } catch { /* ignore */ }
    }
  }, [])

  // ── Voice activity detection — runs continuously while listening ──
  useEffect(() => {
    if (phase !== 'listening' || !recState.isRecording) return

    const meter = recState.metering ?? -160
    // Normalise to 0..1 for visualisation (clamp -60dB silence to 0, 0dB to 1).
    const normalized = Math.max(0, Math.min(1, (meter + 60) / 60))
    setLevel(normalized)

    const elapsed = Date.now() - recordingStartRef.current
    if (elapsed < minRecordingMs) return

    if (meter < silenceDb) {
      if (silenceStartRef.current === null) {
        silenceStartRef.current = Date.now()
      } else if (Date.now() - silenceStartRef.current >= silenceTimeoutMs) {
        // User stopped speaking — process the turn.
        void stopAndProcess()
      }
    } else {
      silenceStartRef.current = null
    }

    // Hard cap on recording length.
    if (elapsed >= maxRecordingMs) {
      void stopAndProcess()
    }
  }, [phase, recState.metering, recState.isRecording, silenceDb, silenceTimeoutMs, minRecordingMs, maxRecordingMs])

  // ── Play audio from base64 ────────────────────────────────────────
  const playAudio = useCallback(async (audioBase64: string): Promise<void> => {
    if (!audioBase64) return

    // Write base64 to a temp file (createAudioPlayer needs a URI).
    const path = `${FileSystem.cacheDirectory}voice_${Date.now()}.mp3`
    await FileSystem.writeAsStringAsync(path, audioBase64, {
      encoding: FileSystem.EncodingType.Base64,
    })

    await configureAudioForPlayback(false) // override silent switch for onboarding

    return new Promise((resolve) => {
      try {
        try { playerRef.current?.remove() } catch { /* ignore */ }
        const player = createAudioPlayer({ uri: path })
        playerRef.current = player

        player.addListener('playbackStatusUpdate', (status) => {
          if (status.didJustFinish) {
            resolve()
          }
        })

        player.play()
      } catch {
        resolve()
      }
    })
  }, [])

  // ── Start recording mic ───────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (completedRef.current) return
    setPhase('listening')
    setLevel(0)
    silenceStartRef.current = null
    stoppingRef.current = false

    await configureAudioForRecording()
    try {
      await recorder.prepareToRecordAsync()
      recorder.record()
      recordingStartRef.current = Date.now()
    } catch {
      setPhase('error')
    }
  }, [recorder])

  // ── Stop recording, send to API, play response, loop ──────────────
  const stopAndProcess = useCallback(async () => {
    if (stoppingRef.current) return
    stoppingRef.current = true
    setPhase('thinking')

    try {
      await recorder.stop()
      const uri = recorder.uri
      if (!uri) throw new Error('no_uri')

      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      })

      const result = await api<{
        transcript: string
        reply: string
        audioBase64: string
        personaUpdate: Record<string, unknown>
        done: boolean
      }>('/voice-agent/turn', {
        method: 'POST',
        body: JSON.stringify({
          audioBase64,
          role,
          personaSoFar: personaRef.current,
          conversation: conversationRef.current.slice(-6),
        }),
      })

      // Update state.
      setTranscript(result.transcript)
      personaRef.current = result.personaUpdate
      setPersona(result.personaUpdate)

      // Append to conversation.
      const userTurn: ChatTurn = { role: 'user', content: result.transcript }
      const assistantTurn: ChatTurn = { role: 'assistant', content: result.reply }
      conversationRef.current = [...conversationRef.current, userTurn, assistantTurn]
      setConversation([...conversationRef.current])

      // Play PAL's response.
      setPhase('speaking')
      await playAudio(result.audioBase64)

      // Done — call onComplete and stop the loop.
      if (result.done) {
        completedRef.current = true
        setPhase('done')
        onComplete(result.personaUpdate)
        return
      }

      // Otherwise loop — start listening again.
      await startListening()
    } catch (err) {
      console.error('voice agent turn error', err)
      // Attempt to recover by listening again.
      setTimeout(() => {
        if (!completedRef.current) startListening()
      }, 1000)
    }
  }, [recorder, role, onComplete, playAudio, startListening])

  // ── Public start ──────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (completedRef.current) return
    if (phase === 'no_permission') return

    setPhase('greeting')
    try {
      const greet = await api<{ reply: string; audioBase64: string }>('/voice-agent/greet', {
        method: 'POST',
        body: JSON.stringify({ role }),
      })

      conversationRef.current = [{ role: 'assistant', content: greet.reply }]
      setConversation([...conversationRef.current])

      await playAudio(greet.audioBase64)

      // After greeting, start listening.
      await startListening()
    } catch {
      setPhase('error')
    }
  }, [role, phase, playAudio, startListening])

  // ── Public stop (e.g. user backs out) ─────────────────────────────
  const stop = useCallback(async () => {
    completedRef.current = true
    try { await recorder.stop() } catch { /* ignore */ }
    try { playerRef.current?.remove() } catch { /* ignore */ }
    setPhase('idle')
  }, [recorder])

  // ── Send a text message directly (skips STT) ──────────────────────
  const sendText = useCallback(async (text: string) => {
    if (completedRef.current) return
    setPhase('thinking')

    try {
      const result = await api<{
        transcript: string
        reply: string
        audioBase64: string
        personaUpdate: Record<string, unknown>
        done: boolean
      }>('/voice-agent/turn', {
        method: 'POST',
        body: JSON.stringify({
          audioBase64: btoa('text:' + text),
          role,
          personaSoFar: personaRef.current,
          conversation: conversationRef.current.slice(-6),
          textOverride: text,
        }),
      })

      setTranscript(result.transcript)
      personaRef.current = result.personaUpdate
      setPersona(result.personaUpdate)

      const userTurn: ChatTurn = { role: 'user', content: text }
      const assistantTurn: ChatTurn = { role: 'assistant', content: result.reply }
      conversationRef.current = [...conversationRef.current, userTurn, assistantTurn]
      setConversation([...conversationRef.current])

      setPhase('speaking')
      await playAudio(result.audioBase64)

      if (result.done) {
        completedRef.current = true
        setPhase('done')
        onComplete(result.personaUpdate)
        return
      }

      await startListening()
    } catch {
      setPhase('idle')
    }
  }, [role, onComplete, playAudio, startListening])

  return {
    phase,
    level,
    transcript,
    conversation,
    persona,
    start,
    stop,
    sendText,
  }
}

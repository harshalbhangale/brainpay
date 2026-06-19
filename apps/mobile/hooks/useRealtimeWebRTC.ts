import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { requestMicPermission, configureAudioForRecording } from '@/lib/audio-mode'

// react-native-webrtc is native-only. Guard the require so Expo Go, web, or a
// dev build that hasn't compiled it yet degrade gracefully instead of crashing.
let RNWebRTC: any = null
try { RNWebRTC = require('react-native-webrtc') } catch { /* unavailable */ }
export const webrtcAvailable = !!RNWebRTC?.RTCPeerConnection

/**
 * useRealtimeWebRTC — live persona onboarding over OpenAI Realtime (GA, WebRTC).
 *
 * Replaces useRealtimeVoice's server WS bridge: the phone connects DIRECTLY to
 * OpenAI via WebRTC using a short-lived ephemeral secret minted by our server
 * (POST /realtime/onboarding-token). WebRTC captures mic + plays PAL's audio
 * natively — fixing the expo-audio raw-PCM limitation that stalled the old path.
 *
 * Same return shape as useRealtimeVoice so the orb UI is a drop-in.
 */

export type RealtimePhase =
  | 'idle' | 'connecting' | 'ready' | 'listening'
  | 'processing' | 'speaking' | 'done' | 'error' | 'no_permission' | 'unsupported'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

type Options = {
  role: 'parent' | 'kid'
  onComplete: (persona: Record<string, unknown>) => void
}

const CALLS_URL = 'https://api.openai.com/v1/realtime/calls'

export function useRealtimeWebRTC({ role, onComplete }: Options) {
  const [phase, setPhase] = useState<RealtimePhase>('idle')
  const [transcript, setTranscript] = useState('')
  const [replyText, setReplyText] = useState('')
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([])
  const [persona, setPersona] = useState<Record<string, unknown>>({})

  const pcRef = useRef<any>(null)
  const dcRef = useRef<any>(null)
  const streamRef = useRef<any>(null)
  const completedRef = useRef(false)
  const pendingDoneRef = useRef(false)
  const replyBufferRef = useRef('')
  const transcriptRef = useRef('')
  const personaRef = useRef<Record<string, unknown>>({})

  const send = (obj: unknown) => {
    try { dcRef.current?.send(JSON.stringify(obj)) } catch { /* ignore */ }
  }

  const handleEvent = useCallback(async (ev: { type: string; [k: string]: unknown }) => {
    switch (ev.type) {
      case 'input_audio_buffer.speech_started':
        setPhase('listening')
        break
      case 'input_audio_buffer.speech_stopped':
        setPhase('processing')
        break
      case 'conversation.item.input_audio_transcription.completed': {
        const text = (ev.transcript as string) ?? ''
        transcriptRef.current = text
        setTranscript(text)
        if (text.trim()) setChatHistory((p) => [...p, { role: 'user', content: text }])
        break
      }
      case 'response.output_audio_transcript.delta':
        replyBufferRef.current += (ev.delta as string) ?? ''
        setReplyText(replyBufferRef.current)
        setPhase('speaking')
        break
      case 'response.output_audio_transcript.done': {
        const full = (ev.transcript as string) || replyBufferRef.current
        if (full.trim()) setChatHistory((p) => [...p, { role: 'assistant', content: full }])
        replyBufferRef.current = ''
        setReplyText('')
        break
      }
      case 'response.function_call_arguments.done': {
        if ((ev.name as string) !== 'save_persona') break
        let args: Record<string, unknown> = {}
        try { args = JSON.parse((ev.arguments as string) ?? '{}') } catch { /* ignore */ }
        personaRef.current = args
        setPersona(args)
        try { await api('/realtime/persona', { method: 'POST', body: JSON.stringify({ role, persona: args }) }) } catch { /* ignore */ }
        // Acknowledge the tool call so PAL can say its goodbye, then finish.
        send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify({ ok: true }) } })
        send({ type: 'response.create' })
        pendingDoneRef.current = true
        break
      }
      case 'response.done':
        if (pendingDoneRef.current && !completedRef.current) {
          completedRef.current = true
          setPhase('done')
          onComplete(personaRef.current)
        } else if (!completedRef.current) {
          setPhase('listening')
        }
        break
      case 'error':
        setPhase('error')
        break
    }
  }, [role, onComplete])

  const connect = useCallback(async () => {
    if (completedRef.current) return
    if (!RNWebRTC?.RTCPeerConnection) { setPhase('unsupported'); return }

    if (!(await requestMicPermission())) { setPhase('no_permission'); return }
    setPhase('connecting')

    try {
      const { clientSecret, model } = await api<{ clientSecret: string; model: string }>(
        '/realtime/onboarding-token', { method: 'POST', body: JSON.stringify({ role }) },
      )

      await configureAudioForRecording()

      const pc = new RNWebRTC.RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      pcRef.current = pc

      const stream = await RNWebRTC.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      stream.getTracks().forEach((t: any) => pc.addTrack(t, stream))

      const dc = pc.createDataChannel('oai-events') as any
      dcRef.current = dc
      dc.addEventListener('open', () => {
        setPhase('ready')
        send({ type: 'response.create' }) // trigger PAL's opening line
      })
      dc.addEventListener('message', (e: { data: string }) => {
        try { void handleEvent(JSON.parse(e.data)) } catch { /* ignore */ }
      })

      const offer = await pc.createOffer({})
      await pc.setLocalDescription(offer)

      const sdpRes = await fetch(`${CALLS_URL}?model=${model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${clientSecret}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      })
      if (!sdpRes.ok) throw new Error(`sdp ${sdpRes.status}`)
      const answer = await sdpRes.text()
      await pc.setRemoteDescription(new RNWebRTC.RTCSessionDescription({ type: 'answer', sdp: answer }))
    } catch {
      setPhase('error')
    }
  }, [role, handleEvent])

  const stop = useCallback(async () => {
    completedRef.current = true
    try { streamRef.current?.getTracks().forEach((t: any) => t.stop()) } catch { /* ignore */ }
    try { dcRef.current?.close() } catch { /* ignore */ }
    try { pcRef.current?.close() } catch { /* ignore */ }
    setPhase('idle')
  }, [])

  useEffect(() => () => { void stop() }, [stop])

  // level kept at 0 — orb animates by phase (RN WebRTC doesn't expose mic metering).
  return { phase, level: 0, transcript, replyText, chatHistory, persona, connect, stop }
}

/**
 * Web Audio helpers for the real-time PAL live session (/live-rt).
 *
 * Gemini Live's audio contract is fixed by the API:
 *   - mic in  : raw PCM16, 16 kHz, mono, little-endian
 *   - PAL out : raw PCM16, 24 kHz, mono, little-endian
 *
 * The browser has no built-in PCM streaming, so we roll our own:
 *   startMicCapture — getUserMedia → AudioContext → ScriptProcessor → PCM16 @ 16k
 *   PcmPlayer       — schedules PCM16 @ 24k chunks gaplessly on an AudioContext
 *
 * Both must be created after a user gesture (the live overlay opens from a tap),
 * which satisfies the browser autoplay / mic-permission rules.
 */

const MIC_RATE = 16000
const OUT_RATE = 24000

export type MicCaptureHandle = {
  stream: MediaStream
  stop: () => void
}

/** Clamp Float32 samples [-1, 1] into signed 16-bit PCM. */
function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/** Downsample a mono Float32 buffer to a lower rate by window-averaging. */
function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (toRate >= fromRate) return input
  const ratio = fromRate / toRate
  const outLen = Math.floor(input.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    out[i] = sum / Math.max(1, end - start)
  }
  return out
}

/**
 * Capture the microphone and emit PCM16 @ 16 kHz mono chunks via `onPcm`.
 * Resolves once the mic is live; call `stop()` to release the device.
 */
export async function startMicCapture(
  onPcm: (pcm: Int16Array) => void,
): Promise<MicCaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  })

  // Prefer capturing straight at 16k; fall back to device rate + downsample.
  let ctx: AudioContext
  try {
    ctx = new AudioContext({ sampleRate: MIC_RATE })
  } catch {
    ctx = new AudioContext()
  }
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)

  const inputRate = ctx.sampleRate
  const source = ctx.createMediaStreamSource(stream)
  const processor = ctx.createScriptProcessor(4096, 1, 1)

  processor.onaudioprocess = (e) => {
    const channel = e.inputBuffer.getChannelData(0)
    const down = downsample(channel, inputRate, MIC_RATE)
    onPcm(floatToPcm16(down))
  }

  // A ScriptProcessor only fires while connected to a destination, so route it
  // through a muted gain node — we want the callback, not the monitor sound.
  const sink = ctx.createGain()
  sink.gain.value = 0
  source.connect(processor)
  processor.connect(sink)
  sink.connect(ctx.destination)

  return {
    stream,
    stop: () => {
      processor.onaudioprocess = null
      try { processor.disconnect() } catch { /* ignore */ }
      try { source.disconnect() } catch { /* ignore */ }
      try { sink.disconnect() } catch { /* ignore */ }
      for (const track of stream.getTracks()) track.stop()
      ctx.close().catch(() => undefined)
    },
  }
}

/**
 * Gapless streaming player for PCM16 @ 24 kHz mono chunks.
 *
 * Each chunk is scheduled to start exactly when the previous one ends, so the
 * stream plays smoothly without clicks. `clear()` cuts playback instantly for
 * barge-in (the user interrupting PAL) or when the speaker is muted.
 */
export class PcmPlayer {
  private ctx: AudioContext | null = null
  private nextTime = 0
  private sources = new Set<AudioBufferSourceNode>()
  private analyser: AnalyserNode | null = null
  private freqData: Uint8Array | null = null

  /** Create/resume the output context. Must run after a user gesture. */
  async resume(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.6
      this.analyser.connect(this.ctx.destination)
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount)
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => undefined)
  }

  /** Current output loudness 0..1 — drives the companion's mouth (lip-sync). */
  getLevel(): number {
    if (!this.analyser || !this.freqData) return 0
    this.analyser.getByteFrequencyData(this.freqData)
    let sum = 0
    for (let i = 0; i < this.freqData.length; i++) sum += this.freqData[i]
    const avg = sum / this.freqData.length / 255
    // Emphasise speech band a touch and clamp.
    return Math.min(1, avg * 1.8)
  }

  enqueue(pcm: Int16Array): void {
    const ctx = this.ctx
    if (!ctx || pcm.length === 0) return

    const buffer = ctx.createBuffer(1, pcm.length, OUT_RATE)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.analyser ?? ctx.destination)

    // Small lead-in keeps the first chunk from being scheduled in the past.
    const start = Math.max(ctx.currentTime + 0.03, this.nextTime)
    src.start(start)
    this.nextTime = start + buffer.duration

    this.sources.add(src)
    src.onended = () => this.sources.delete(src)
  }

  /**
   * Decode an encoded audio clip (e.g. MP3 from ElevenLabs) and schedule it
   * gaplessly after whatever is already queued. Routed through the analyser so
   * lip-sync (getLevel) works for this source too.
   */
  async enqueueEncoded(data: ArrayBuffer): Promise<void> {
    const ctx = this.ctx
    if (!ctx || data.byteLength === 0) return
    let buffer: AudioBuffer
    try {
      buffer = await ctx.decodeAudioData(data.slice(0))
    } catch {
      return
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.analyser ?? ctx.destination)
    const start = Math.max(ctx.currentTime + 0.03, this.nextTime)
    src.start(start)
    this.nextTime = start + buffer.duration
    this.sources.add(src)
    src.onended = () => this.sources.delete(src)
  }

  /** Stop everything immediately (barge-in / mute). */
  clear(): void {
    for (const src of this.sources) {
      try { src.stop() } catch { /* ignore */ }
    }
    this.sources.clear()
    this.nextTime = 0
  }

  close(): void {
    this.clear()
    this.ctx?.close().catch(() => undefined)
    this.ctx = null
  }
}

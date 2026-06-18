/**
 * Buffers streamed MP3 chunks (WS tag 0x02) per detection and plays the
 * complete utterance when the server signals speech.ended.
 *
 * Mirrors the mobile client's buffer-then-play approach, using the browser
 * Audio element instead of expo-audio. Browser autoplay rules require the
 * first playback to follow a user gesture (handled by the camera screen's
 * "start" tap).
 */
export class SpeechPlayer {
  private buffers = new Map<string, Uint8Array[]>()
  private current: HTMLAudioElement | null = null
  private currentUrl: string | null = null

  start(detectionId: string): void {
    this.buffers.set(detectionId, [])
  }

  push(detectionId: string, chunk: Uint8Array): void {
    const arr = this.buffers.get(detectionId)
    if (arr) arr.push(chunk)
    else this.buffers.set(detectionId, [chunk])
  }

  play(detectionId: string): void {
    const chunks = this.buffers.get(detectionId)
    this.buffers.delete(detectionId)
    if (!chunks || chunks.length === 0) return

    const parts: BlobPart[] = chunks.map((c) => c.slice())
    const blob = new Blob(parts, { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)

    this.stop()
    const audio = new Audio(url)
    this.current = audio
    this.currentUrl = url
    audio.onended = () => this.revoke(url)
    audio.play().catch(() => this.revoke(url))
  }

  stop(): void {
    if (this.current) {
      this.current.pause()
      this.current = null
    }
    if (this.currentUrl) this.revoke(this.currentUrl)
  }

  reset(): void {
    this.stop()
    this.buffers.clear()
  }

  private revoke(url: string): void {
    URL.revokeObjectURL(url)
    if (this.currentUrl === url) this.currentUrl = null
  }
}

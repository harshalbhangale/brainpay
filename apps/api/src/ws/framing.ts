import { WS_TAG_AUDIO, WS_TAG_FRAME } from '@brainpal/shared'

/**
 * Binary WS framing.
 *   C→S frames: [0x01][JPEG bytes]
 *   S→C audio:  [0x02][uint32 BE seq][MP3 bytes]
 */

export function decodeFrame(buf: Uint8Array): Uint8Array | null {
  if (buf.length < 2 || buf[0] !== WS_TAG_FRAME) return null
  return buf.slice(1)
}

export function encodeAudioChunk(seq: number, mp3: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + 4 + mp3.length)
  out[0] = WS_TAG_AUDIO
  // big-endian uint32 seq
  out[1] = (seq >>> 24) & 0xff
  out[2] = (seq >>> 16) & 0xff
  out[3] = (seq >>> 8) & 0xff
  out[4] = seq & 0xff
  out.set(mp3, 5)
  return out
}

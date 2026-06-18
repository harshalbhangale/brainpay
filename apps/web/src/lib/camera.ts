/**
 * Browser camera capture — the web replacement for expo-camera +
 * expo-image-manipulator + expo-file-system from the mobile client.
 *
 *   getUserMedia -> <video> -> draw to <canvas> -> canvas.toBlob(jpeg)
 *
 * Produces the same raw JPEG bytes the server's perception pipeline expects,
 * so nothing on the backend changes.
 */
export type CameraHandle = {
  stream: MediaStream
  stop: () => void
}

export async function startCamera(video: HTMLVideoElement): Promise<CameraHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  })
  video.srcObject = stream
  video.muted = true
  video.setAttribute('playsinline', 'true')
  await video.play().catch(() => undefined)
  return {
    stream,
    stop: () => {
      for (const track of stream.getTracks()) track.stop()
      video.srcObject = null
    },
  }
}

export async function captureJpeg(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  maxWidth = 384,
  quality = 0.6,
): Promise<Uint8Array | null> {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null

  const scale = Math.min(1, maxWidth / vw)
  const w = Math.round(vw * scale)
  const h = Math.round(vh * scale)
  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, w, h)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) return null
  return new Uint8Array(await blob.arrayBuffer())
}

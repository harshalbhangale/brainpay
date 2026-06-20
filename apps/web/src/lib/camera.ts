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
  zoom = 1,
): Promise<Uint8Array | null> {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null

  // Digital zoom: crop a centred region and blow it up, so the model "sees"
  // exactly what the zoomed preview shows.
  const z = Math.max(1, zoom)
  const cropW = vw / z
  const cropH = vh / z
  const sx = (vw - cropW) / 2
  const sy = (vh - cropH) / 2

  const scale = Math.min(1, maxWidth / cropW)
  const w = Math.round(cropW * scale)
  const h = Math.round(cropH * scale)
  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, w, h)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) return null
  return new Uint8Array(await blob.arrayBuffer())
}

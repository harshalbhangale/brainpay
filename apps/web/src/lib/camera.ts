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
  /** Real camera zoom range if the device/track supports it. */
  zoomCaps: { min: number; max: number; step: number } | null
  /** Apply real (optical/sensor) zoom. Returns true if applied on the track. */
  setZoom: (z: number) => boolean
}

export async function startCamera(video: HTMLVideoElement, provided?: MediaStream): Promise<CameraHandle> {
  // When a combined (audio+video) stream is provided we reuse it — calling
  // getUserMedia a second time for the mic kills the camera track on iOS
  // Safari, which shows up as a black feed. The caller then owns teardown.
  const ownsStream = !provided
  const stream =
    provided ??
    (await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    }))
  video.srcObject = stream
  video.muted = true
  video.setAttribute('playsinline', 'true')
  await video.play().catch(() => undefined)

  const track = stream.getVideoTracks()[0]
  // Some devices (notably Android rear cameras) expose a real `zoom` capability.
  const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
    zoom?: { min: number; max: number; step: number }
  }
  const zoomCaps = caps.zoom ? { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 } : null

  return {
    stream,
    zoomCaps,
    setZoom: (z) => {
      if (!zoomCaps || !track) return false
      const clamped = Math.max(zoomCaps.min, Math.min(zoomCaps.max, z))
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        track.applyConstraints({ advanced: [{ zoom: clamped } as any] })
        return true
      } catch {
        return false
      }
    },
    stop: () => {
      // Only stop tracks we created; a provided (shared) stream is owned by
      // the caller, which tears it down once.
      if (ownsStream) for (const t of stream.getTracks()) t.stop()
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

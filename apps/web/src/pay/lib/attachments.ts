/**
 * attachments — shared "attach files to a Pal chat" plumbing.
 * ───────────────────────────────────────────────────────────────────────────
 * Every Pal window (BrainChat, MoneyChat, StudyChat) uses the same model:
 *   • images  → downscaled to a compact JPEG data URL, sent through the existing
 *               vision pipeline (`images[]` on /chat).
 *   • PDFs    → text extracted client-side with pdfjs (lazy-loaded, no canvas),
 *               sent as `documents[]` on /chat, or used as StudyPal deck source.
 *
 * The hook `useAttachments` owns the tray state + async processing; the pure
 * selectors turn a tray into the payload each surface needs.
 */
import { useCallback, useState } from 'react'

export type AttachmentKind = 'image' | 'pdf'
export type AttachmentStatus = 'loading' | 'ready' | 'error'

export type Attachment = {
  id: string
  kind: AttachmentKind
  name: string
  size: number
  status: AttachmentStatus
  /** Image only: downscaled JPEG data URL (preview + vision). */
  dataUrl?: string
  /** PDF only: extracted text (capped). */
  text?: string
  /** PDF only: total page count. */
  pages?: number
  error?: string
}

export const MAX_ATTACHMENTS = 4
const MAX_PDF_PAGES = 8
const MAX_PDF_CHARS = 16_000
export const ACCEPT_ATTACHMENTS = 'image/*,application/pdf'

let seq = 1
const nextId = () => `att${seq++}`

/** Downscale a picked image to a compact JPEG data URL — vision-ready. */
export async function fileToImageDataUrl(file: File, max = 1024, quality = 0.72): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
  return await new Promise<string>((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(raw); return }
      ctx.drawImage(img, 0, 0, w, h)
      try { resolve(canvas.toDataURL('image/jpeg', quality)) } catch { resolve(raw) }
    }
    img.onerror = () => resolve(raw)
    img.src = raw
  })
}

// pdfjs is heavy — load it (and its worker) only when a PDF is actually attached.
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist')
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      return pdfjs
    })()
  }
  return pdfjsPromise
}

/** Extract readable text from a PDF (first pages, capped) using pdfjs. */
export async function extractPdfText(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await loadPdfjs()
  const data = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data })
  const doc = await loadingTask.promise
  const total = doc.numPages
  const pageCount = Math.min(total, MAX_PDF_PAGES)
  let text = ''
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((it) => ('str' in it ? (it as { str: string }).str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (line) text += line + '\n\n'
    if (text.length >= MAX_PDF_CHARS) break
  }
  try { await loadingTask.destroy() } catch { /* ignore */ }
  return { text: text.slice(0, MAX_PDF_CHARS).trim(), pages: total }
}

/** React state + async processing for a chat attachment tray. */
export function useAttachments(max = MAX_ATTACHMENTS) {
  const [items, setItems] = useState<Attachment[]>([])

  const patch = useCallback((id: string, next: Partial<Attachment>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...next } : it)))
  }, [])

  const add = useCallback(async (files: FileList | File[] | null) => {
    const picked = Array.from(files ?? []).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf')
    if (picked.length === 0) return
    // Reserve slots synchronously so parallel adds respect the cap.
    let room = 0
    setItems((prev) => { room = Math.max(0, max - prev.length); return prev })
    const take = picked.slice(0, room)
    const seeded: Attachment[] = take.map((f) => ({
      id: nextId(),
      kind: f.type === 'application/pdf' ? 'pdf' : 'image',
      name: f.name || (f.type === 'application/pdf' ? 'Document.pdf' : 'Image'),
      size: f.size,
      status: 'loading',
    }))
    setItems((prev) => [...prev, ...seeded])
    await Promise.all(
      take.map(async (file, i) => {
        const at = seeded[i]
        try {
          if (at.kind === 'image') {
            const dataUrl = await fileToImageDataUrl(file)
            patch(at.id, { status: 'ready', dataUrl })
          } else {
            const { text, pages } = await extractPdfText(file)
            if (!text) { patch(at.id, { status: 'error', error: 'No readable text', pages }); return }
            patch(at.id, { status: 'ready', text, pages })
          }
        } catch {
          patch(at.id, { status: 'error', error: 'Could not read file' })
        }
      }),
    )
  }, [max, patch])

  const remove = useCallback((id: string) => setItems((prev) => prev.filter((it) => it.id !== id)), [])
  const clear = useCallback(() => setItems([]), [])

  const busy = items.some((it) => it.status === 'loading')
  const hasReady = items.some((it) => it.status === 'ready')

  return { items, add, remove, clear, busy, hasReady }
}

/** Ready image data URLs for the vision pipeline (`images[]`). */
export function visionImages(items: Attachment[], cap = MAX_ATTACHMENTS): string[] {
  return items.filter((it) => it.kind === 'image' && it.status === 'ready' && it.dataUrl).map((it) => it.dataUrl as string).slice(0, cap)
}

/** Ready PDF documents for the `documents[]` field on /chat. */
export function chatDocuments(items: Attachment[], cap = 3): { name: string; text: string }[] {
  return items.filter((it) => it.kind === 'pdf' && it.status === 'ready' && it.text).map((it) => ({ name: it.name, text: it.text as string })).slice(0, cap)
}

/** All ready PDF text joined — used by StudyPal to build a deck from a document. */
export function documentText(items: Attachment[]): string {
  return items.filter((it) => it.kind === 'pdf' && it.status === 'ready' && it.text).map((it) => `${it.name}\n${it.text}`).join('\n\n').trim()
}

/** Short human summary for a message/transcript line, e.g. "2 files · report.pdf". */
export function attachmentSummary(items: Attachment[]): string {
  const ready = items.filter((it) => it.status === 'ready')
  if (ready.length === 0) return ''
  const names = ready.map((it) => it.name).slice(0, 2).join(', ')
  return ready.length > 2 ? `${names} +${ready.length - 2}` : names
}

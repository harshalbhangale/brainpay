import { api } from './api'

type Presign = { path: string; signedUrl: string; token: string; fileRef: string }

/**
 * Upload a file straight to Supabase Storage via a short-lived signed URL
 * minted by our API. Returns a stable `fileRef` (supabase://<path>) to persist
 * on records; the server resolves it to a signed GET URL when needed.
 */
export async function uploadFile(file: File, kind: string): Promise<{ fileRef: string }> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : undefined
  const pre = await api<Presign>('/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({ kind, ext, contentType: file.type || undefined }),
  })
  const put = await fetch(pre.signedUrl, {
    method: 'PUT',
    headers: file.type ? { 'content-type': file.type } : undefined,
    body: file,
  })
  if (!put.ok) throw new Error(`upload failed: ${put.status}`)
  return { fileRef: pre.fileRef }
}

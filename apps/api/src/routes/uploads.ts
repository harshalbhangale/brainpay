import { Hono } from 'hono'
import { z } from 'zod'
import { authedAccountId, requireAuth, type AuthVars } from '../middleware/auth'
import { createUpload, storageConfigured } from '../services/storage'

/**
 * Uploads — issue short-lived signed URLs so the browser uploads files straight
 * to Supabase Storage. The returned `fileRef` (supabase://<path>) is what gets
 * stored on records (e.g. study documents) and resolved to a signed GET URL
 * server-side when needed.
 */
export const uploads = new Hono<{ Variables: AuthVars }>()
uploads.use('*', requireAuth)

uploads.post('/uploads/presign', async (c) => {
  if (!storageConfigured()) return c.json({ error: 'storage_unconfigured' }, 503)
  const accountId = authedAccountId(c)

  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({
    kind: z.string().min(1).max(24).default('file'),
    ext: z.string().max(8).optional(),
    contentType: z.string().max(120).optional(),
  }).safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400)

  try {
    const up = await createUpload(accountId, parsed.data.kind, parsed.data.ext)
    return c.json({
      path: up.path,
      signedUrl: up.signedUrl,
      token: up.token,
      fileRef: `supabase://${up.path}`,
    })
  } catch {
    return c.json({ error: 'presign_failed' }, 502)
  }
})

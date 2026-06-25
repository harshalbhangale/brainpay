/**
 * Object storage on Supabase Storage (S3 is blocked in this sandbox).
 * ───────────────────────────────────────────────────────────────────────────
 * Private bucket; the browser uploads directly via a short-lived signed upload
 * URL (no file bytes pass through our API), and reads go through signed URLs.
 * Uses the service-role key — server-side only.
 */
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'uploads'
const READ_TTL = 60 * 60 * 24 * 7 // 7 days

function apiUrl(): string {
  return process.env.SUPABASE_API_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || ''
}
function serviceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function storageConfigured(): boolean {
  return !!(apiUrl() && serviceKey())
}

let client: SupabaseClient | null = null
function sb(): SupabaseClient {
  if (!storageConfigured()) throw new Error('Supabase storage not configured (SUPABASE_API_URL / SERVICE_ROLE_KEY)')
  if (!client) client = createClient(apiUrl(), serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}

/** Create the private bucket if it doesn't exist (idempotent). */
export async function ensureBucket(): Promise<void> {
  const got = await sb().storage.getBucket(STORAGE_BUCKET)
  if (got.data) return
  const { error } = await sb().storage.createBucket(STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: '50MB',
  })
  if (error && !/exist/i.test(error.message)) throw error
}

function safeExt(ext?: string): string {
  return (ext || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase() || 'bin'
}

export type Upload = { path: string; signedUrl: string; token: string }

/** Mint a one-time signed upload URL the browser PUTs the file to directly. */
export async function createUpload(accountId: string, kind: string, ext?: string): Promise<Upload> {
  const safeKind = kind.replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'file'
  const path = `${accountId}/${safeKind}/${randomUUID()}.${safeExt(ext)}`
  const { data, error } = await sb().storage.from(STORAGE_BUCKET).createSignedUploadUrl(path)
  if (error || !data) throw error ?? new Error('createSignedUploadUrl failed')
  return { path, signedUrl: data.signedUrl, token: data.token }
}

/** Time-limited signed GET URL for a stored object. */
export async function signedReadUrl(path: string, expiresIn = READ_TTL): Promise<string> {
  const { data, error } = await sb().storage.from(STORAGE_BUCKET).createSignedUrl(path, expiresIn)
  if (error || !data) throw error ?? new Error('createSignedUrl failed')
  return data.signedUrl
}

/** Resolve a stored reference (`supabase://<path>`) to a fetchable URL; pass
 *  through anything already http(s). Returns null for non-resolvable schemes. */
export async function resolveReadUrl(fileUrl: string): Promise<string | null> {
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl
  if (fileUrl.startsWith('supabase://')) return signedReadUrl(fileUrl.slice('supabase://'.length))
  return null
}

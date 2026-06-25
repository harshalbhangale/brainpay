/**
 * Create the Supabase Storage bucket + verify upload/read end-to-end.
 * Run: tsx --env-file=../../.env scripts/storage-setup.ts
 */
import { STORAGE_BUCKET, storageConfigured, ensureBucket, createUpload, signedReadUrl } from '../src/services/storage'

async function main() {
  if (!storageConfigured()) {
    console.error('❌ storage not configured (need SUPABASE_API_URL or EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)')
    process.exit(1)
  }
  console.log('bucket:', STORAGE_BUCKET)
  await ensureBucket()
  console.log('✅ bucket ready')

  // Upload a tiny object via the signed upload URL (same path the browser uses).
  const up = await createUpload('smoke-test', 'diag', 'txt')
  const put = await fetch(up.signedUrl, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: 'hello from storage-setup' })
  console.log('▸ PUT object →', put.status)
  if (!put.ok) { console.error('upload failed:', await put.text()); process.exit(1) }

  const readUrl = await signedReadUrl(up.path, 60)
  const get = await fetch(readUrl)
  const text = await get.text()
  console.log('▸ GET object →', get.status, JSON.stringify(text))
  console.log(text === 'hello from storage-setup' ? '✅ round-trip OK' : '⚠️ unexpected content')
}
main().catch((e) => { console.error('❌ failed:', e?.message ?? e); process.exit(1) })

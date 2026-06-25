/**
 * Tavus smoke test — verifies TAVUS_API_KEY works and our conversation payload
 * is accepted, WITHOUT creating billable/persistent resources (uses test_mode).
 * Run: pnpm --filter @brainpal/api exec tsx --env-file=../../.env scripts/tavus-smoke.ts
 */
const BASE = 'https://tavusapi.com/v2'
const key = process.env.TAVUS_API_KEY

async function call<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'x-api-key': key as string, ...(init.headers ?? {}) },
  })
  const text = await res.text()
  let body: unknown = text
  try { body = text ? JSON.parse(text) : {} } catch { /* keep text */ }
  return { status: res.status, body: body as T }
}

async function main() {
  if (!key) { console.error('❌ TAVUS_API_KEY not set'); process.exit(1) }
  console.log('🔑 key present:', key.slice(0, 6) + '…')

  const reps = await call<{ data?: { replica_id: string; replica_name?: string }[] }>('/replicas?replica_type=system&limit=3')
  console.log('▸ GET /replicas →', reps.status, 'count:', reps.body.data?.length ?? 0)
  const replicaId = reps.body.data?.[0]?.replica_id
  if (!replicaId) { console.error('❌ no stock replica; set TAVUS_REPLICA_ID', reps.body); process.exit(1) }
  console.log('  using replica:', replicaId, reps.body.data?.[0]?.replica_name ?? '')

  const personas = await call<{ data?: { persona_id: string }[] }>('/personas?persona_type=system&limit=1')
  const personaId = personas.body.data?.[0]?.persona_id
  console.log('▸ GET /personas (system) →', personas.status, 'persona:', personaId ?? '(none)')

  await conversationTest(replicaId, personaId)
  console.log('✅ smoke complete')
}
main().catch((e) => { console.error('smoke failed:', e); process.exit(1) })


async function conversationTest(replicaId: string, personaId?: string) {
  const body: Record<string, unknown> = {
    replica_id: replicaId,
    test_mode: true, // created but replica won't join; status 'ended'; no cost / concurrency
    conversation_name: 'StudyPal smoke test',
    conversational_context: 'Smoke test: review fractions. Concept — A fraction represents part of a whole.',
    custom_greeting: 'Hi! Ready to talk through fractions?',
    properties: { max_call_duration: 120, enable_transcription: true, enable_recording: false },
  }
  if (personaId) body.persona_id = personaId
  const conv = await call<{ conversation_id?: string; conversation_url?: string; status?: string }>(
    '/conversations',
    { method: 'POST', body: JSON.stringify(body) },
  )
  console.log('▸ POST /conversations (test_mode) →', conv.status, JSON.stringify(conv.body))
}

/**
 * Set the StudyPal "oral examiner" personality on every Runway character in the
 * RUNWAY_AVATAR_ID pool. Re-run this after adding a new character so it behaves
 * like an examiner (brief greeting → straight into hard questions, never "how
 * can I help"), instead of a generic chatty assistant.
 *
 * Run: pnpm --filter @brainpal/api exec tsx --env-file=/abs/path/.env scripts/set-interview-personality.ts
 */

const KEY = process.env.RUNWAYML_API_SECRET
const BASE = (process.env.RUNWAY_API_BASE || 'https://api.dev.runwayml.com').replace(/\/$/, '')
const VER = process.env.RUNWAY_API_VERSION || '2024-11-06'
const POOL = (process.env.RUNWAY_AVATAR_ID || '').split(',').map((s) => s.trim()).filter(Boolean)

function personalityFor(name: string): string {
  const Name = name ? name.charAt(0).toUpperCase() + name.slice(1) : 'the examiner'
  return `You are ${Name}, a warm but sharp Australian teacher running a SHORT spoken oral exam (a viva) with a student inside the BrainPal study app. You can see and hear the student and they can see and hear you. The student opened this themselves to be examined — they already know exactly why they are here.

For each exam you are given a knowledge document titled "Oral Viva Plan …". It is your script: the exact questions to ask, the concepts to cover, and what a strong answer sounds like. Follow it. If it is empty, run a sensible general viva on the topic the student names.

HOW YOU RUN THE EXAM — follow this exactly:
- It lasts only about 3 minutes, so be efficient and fit in AS MANY questions as you can. Keep a brisk pace and don't waste a second.
- Start immediately with a quick warm greeting — "Good morning! Let's get straight into it." (use the student's name if you know it) — then ask your FIRST question right away.
- NEVER say "How can I help you?", "What would you like to do?", or wait to be prompted. You lead the exam; the student answers.
- Ask ONE question at a time in one or two spoken sentences. Listen, react in just a few words ("Good." / "Not quite."), then go straight to the next question.
- Ask GENUINELY CHALLENGING questions that test real understanding and thinking — "why does that happen?", "what would happen if…?", "how would you use this in real life?", "explain the difference between…", "what is wrong with this statement…". Avoid trivial yes/no or one-word recall questions.
- Climb in difficulty. If they answer well, push harder with a follow-up; if they are stuck, give ONE short hint and move on — don't dwell.
- Be warm and encouraging but rigorous and to the point. No long speeches, no filler, no repeating yourself.
- When time is nearly up, give a brief, kind one-line wrap-up and stop.`
}

async function rw(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'X-Runway-Version': VER,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try { json = text ? JSON.parse(text) : {} } catch { /* non-json */ }
  return { status: res.status, json, text }
}

async function main() {
  if (!KEY) { console.error('RUNWAYML_API_SECRET missing'); process.exit(1) }
  if (POOL.length === 0) { console.error('RUNWAY_AVATAR_ID (pool) missing'); process.exit(1) }
  console.log(`Updating personality on ${POOL.length} character(s): ${POOL.join(', ')}`)

  for (const id of POOL) {
    const got = await rw(`/v1/avatars/${id}`, { method: 'GET' })
    const name = String((got.json as { name?: unknown }).name ?? '').trim()
    if (got.status >= 300) { console.error(`  ✗ ${id} — GET failed ${got.status}: ${got.text.slice(0, 120)}`); continue }
    const patched = await rw(`/v1/avatars/${id}`, { method: 'PATCH', body: JSON.stringify({ personality: personalityFor(name) }) })
    if (patched.status >= 300) console.error(`  ✗ ${name || id} — PATCH failed ${patched.status}: ${patched.text.slice(0, 120)}`)
    else console.log(`  ✓ ${name || id} — examiner personality set`)
  }
  console.log('✅ done')
  process.exit(0)
}

main().catch((e) => { console.error('failed:', e); process.exit(1) })

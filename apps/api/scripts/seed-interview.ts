/**
 * Seed sample completed interviews for a kid (by phone) so the interview history
 * + parent oversight have realistic demo data.
 * Run: pnpm --filter @brainpal/api exec tsx --env-file=../../.env scripts/seed-interview.ts
 */
import { and, desc, eq, like, or } from 'drizzle-orm'
import { db } from '../src/db'
import { accounts } from '../src/db/schema'
import { studyTopics, studyInterviews } from '../src/db/study-schema'

const PHONE_DIGITS = '9876543210'

async function main() {
  // 1) Find the kid account by phone (tolerant of +91 / spacing).
  const [acct] = await db
    .select({ id: accounts.id, phone: accounts.phone, persona: accounts.persona })
    .from(accounts)
    .where(or(eq(accounts.phone, `+91${PHONE_DIGITS}`), like(accounts.phone, `%${PHONE_DIGITS}`)))
    .limit(1)
  if (!acct) {
    console.error(`❌ No account found for phone ending ${PHONE_DIGITS}`)
    process.exit(1)
  }
  console.log('✓ account:', acct.id, acct.phone)

  // 2) Find or create a topic to attach the interviews to.
  let [topic] = await db
    .select({ id: studyTopics.id, title: studyTopics.title })
    .from(studyTopics)
    .where(eq(studyTopics.accountId, acct.id))
    .orderBy(desc(studyTopics.createdAt))
    .limit(1)
  if (!topic) {
    const familyId = (acct.persona as Record<string, unknown>)?.familyId as string | undefined
    // studyTopics needs a familyId; pull it from the kid's membership.
    const { memberships } = await import('../src/db/schema')
    const [m] = await db.select({ familyId: memberships.familyId }).from(memberships).where(eq(memberships.accountId, acct.id)).limit(1)
    const fam = m?.familyId ?? familyId
    if (!fam) { console.error('❌ kid has no family membership; cannot create a topic'); process.exit(1) }
    ;[topic] = await db.insert(studyTopics).values({
      accountId: acct.id, familyId: fam, title: 'Science', emoji: '🔬', totalCards: 18, cardsDue: 6,
    }).returning({ id: studyTopics.id, title: studyTopics.title })
    console.log('✓ created topic:', topic.title)
  } else {
    console.log('✓ topic:', topic.title)
  }

  // 3) Insert a few realistic completed interviews (varied dates/scores).
  const day = 86400000
  const samples = [
    {
      chapter: 'Photosynthesis', score: 9, daysAgo: 1, durationSecs: 214, brainsEarned: 27,
      summary: 'Strong grasp of photosynthesis — explained the light and dark reactions clearly and gave a great real-world example.',
      keepPractising: ['Difference between the light-dependent reactions and the Calvin cycle'],
      focusAreas: ['Photosynthesis', 'Chlorophyll', 'Light-dependent reactions', 'Calvin cycle'],
      focus: { lookingPct: 94, flags: [] as string[] },
      transcript: [
        { role: 'tutor', text: 'Hi! Let’s talk through photosynthesis. In your own words, what is it?' },
        { role: 'kid', text: 'It’s how plants make their own food using sunlight, water and carbon dioxide, and they give off oxygen.' },
        { role: 'tutor', text: 'Lovely. Where exactly in the plant does it happen, and what makes it green?' },
        { role: 'kid', text: 'In the chloroplasts, and chlorophyll is the green pigment that absorbs the light.' },
        { role: 'tutor', text: 'Great. What if a plant was kept in red light only — would it still work?' },
        { role: 'kid', text: 'Mostly yes, because chlorophyll absorbs red light well, but not as much as with full sunlight.' },
        { role: 'tutor', text: 'Excellent reasoning. That’s a strong finish — well done!' },
      ],
    },
    {
      chapter: 'Forces and Motion', score: 7, daysAgo: 3, durationSecs: 188, brainsEarned: 21,
      summary: 'Good understanding of Newton’s laws; could be sharper on linking force, mass and acceleration in examples.',
      keepPractising: ['Applying F = ma to everyday examples', 'Friction as a force that opposes motion'],
      focusAreas: ["Newton's First Law", "Newton's Second Law", 'Friction'],
      focus: { lookingPct: 81, flags: ['Glanced away from the screen a few times'] },
      transcript: [
        { role: 'tutor', text: 'Can you tell me Newton’s First Law in your own words?' },
        { role: 'kid', text: 'An object stays still or keeps moving the same way unless a force acts on it.' },
        { role: 'tutor', text: 'Good. If you push a heavier trolley with the same force, what happens to its acceleration?' },
        { role: 'kid', text: 'Um… it accelerates less because it’s heavier.' },
        { role: 'tutor', text: 'Right — that’s F = ma. Keep practising turning that into examples.' },
      ],
    },
    {
      chapter: 'Fractions', score: 6, daysAgo: 6, durationSecs: 160, brainsEarned: 18,
      summary: 'Knows what fractions represent; needs more confidence adding fractions with different denominators.',
      keepPractising: ['Adding fractions with unlike denominators', 'Simplifying fractions'],
      focusAreas: ['Fractions', 'Equivalent fractions', 'Adding fractions'],
      focus: { lookingPct: 88, flags: [] as string[] },
      transcript: [
        { role: 'tutor', text: 'What does the fraction three-quarters mean?' },
        { role: 'kid', text: 'It means 3 parts out of 4 equal parts.' },
        { role: 'tutor', text: 'Nice. What’s one half plus one third?' },
        { role: 'kid', text: 'Is it… two fifths? I’m not sure.' },
        { role: 'tutor', text: 'Close thinking — we’ll practise common denominators. Good effort today!' },
      ],
    },
  ]

  for (const s of samples) {
    const completedAt = new Date(Date.now() - s.daysAgo * day)
    const createdAt = new Date(completedAt.getTime() - s.durationSecs * 1000 - 30000)
    const [row] = await db.insert(studyInterviews).values({
      topicId: topic.id,
      accountId: acct.id,
      focusAreas: s.focusAreas,
      transcript: s.transcript,
      durationSecs: s.durationSecs,
      score: s.score,
      brainsEarned: s.brainsEarned,
      status: 'completed',
      chapter: s.chapter,
      mode: 'chapter',
      summary: s.summary,
      keepPractising: s.keepPractising,
      focus: s.focus,
      createdAt,
      completedAt,
    }).returning({ id: studyInterviews.id })
    console.log(`✓ interview "${s.chapter}" (score ${s.score}/10) → ${row.id}`)
  }

  console.log('✅ done')
  process.exit(0)
}

main().catch((e) => { console.error('seed failed:', e); process.exit(1) })

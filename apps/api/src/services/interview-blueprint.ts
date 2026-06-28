/**
 * Interview blueprint generator.
 * ───────────────────────────────────────────────────────────────────────────
 * Turns a topic's PDF-derived concepts (study cards) into a structured oral-viva
 * plan — the same idea as generating flashcards/quizzes, but for a spoken exam.
 *
 * The blueprint drives two things:
 *  1. The interviewer's question plan — rendered to Markdown and attached to the
 *     Runway avatar as a knowledge document (Phase 1 / Option A), or fed to our
 *     own LLM as context (Phase 2 / Option B).
 *  2. Scoring — the rubric + concept list grade how well the student reasoned.
 *
 * Layered question types push from recall → understanding → application →
 * exploration, so the viva tests thinking, not memorisation.
 */
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type BlueprintConcept = { front: string; back: string }

export type BlueprintQuestion = {
  /** recall | explain | apply | what_if | spot_mistake | connect */
  type: string
  text: string
  /** What a strong answer demonstrates — used by the interviewer and for scoring. */
  rubric: string
}

export type BlueprintSegment = {
  concept: string
  questions: BlueprintQuestion[]
  followUps: string
}

export type InterviewBlueprint = {
  topicTitle: string
  chapter?: string | null
  opening: string
  segments: BlueprintSegment[]
  rubric: { dimensions: string[]; scale: string }
  closing: string
}

export type GeneratedBlueprint = {
  blueprint: InterviewBlueprint
  /** Concept labels for transcript scoring (stored in studyInterviews.focusAreas). */
  focusAreas: string[]
  /** The blueprint rendered as a Markdown knowledge document for the avatar. */
  knowledgeMarkdown: string
}

const QUESTION_TYPES =
  'recall (quick check), explain (in their own words), apply (real-world scenario), what_if (predict/extend), spot_mistake (state a subtly wrong claim and ask them to correct it), connect (relate two ideas)'

/**
 * Generate a viva blueprint from the topic's concepts. Falls back to a minimal
 * blueprint if the model misbehaves, so an interview never dead-ends.
 */
export async function generateBlueprint(input: {
  topicTitle: string
  chapter?: string | null
  concepts: BlueprintConcept[]
  kidName?: string | null
  grade?: string | null
}): Promise<GeneratedBlueprint> {
  const concepts = input.concepts.slice(0, 24)
  const conceptBlock = concepts.map((c) => `- ${c.front} :: ${c.back}`).join('\n') || '(general review)'
  const who = [
    input.kidName ? `The student's name is ${input.kidName}.` : '',
    input.grade ? `They are in ${input.grade}; pitch difficulty and language accordingly.` : '',
  ].filter(Boolean).join(' ')

  let blueprint: InterviewBlueprint | null = null
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You design a SHORT (about 3 minutes), BRISK oral viva (spoken examination) for a student, grounded ONLY in the provided concepts (which came from their study material). It must test genuine understanding and the ability to think and explore — NOT rote recall. The examiner moves fast and asks as many questions as fit in 3 minutes, so give a rich, well-ordered plan of CHALLENGING questions.

Return ONLY JSON matching:
{
  "opening": "<a brief warm greeting (e.g. 'Good morning!') that goes STRAIGHT into the first real question — no 'how can I help', no preamble>",
  "segments": [
    {
      "concept": "<concept label>",
      "questions": [
        { "type": "<one of: ${QUESTION_TYPES}>", "text": "<the spoken question>", "rubric": "<what a strong answer shows>" }
      ],
      "followUps": "<how to probe deeper if they answer well, or give ONE hint (never the answer) if stuck>"
    }
  ],
  "rubric": { "dimensions": ["recall","understanding","application","reasoning","communication"], "scale": "1-10" },
  "closing": "<one encouraging, honest closing sentence>"
}

Rules:
- Cover 5-8 of the most important concepts; 2 layered questions each, ordered HARDEST / most-revealing first so the best questions get asked even if time runs short.
- Favour challenging question types — explain, apply, what_if, spot_mistake, connect. Use recall sparingly, only as a quick warm-up. NEVER ask trivial yes/no or one-word questions.
- Vary question types; do NOT use the same type twice in a row.
- Questions must be answerable from the concepts; never invent facts beyond them.
- Keep each question to ONE spoken sentence. ${who}`,
        },
        {
          role: 'user',
          content: `Topic: ${input.topicTitle}${input.chapter ? ` — chapter: ${input.chapter}` : ''}\n\nConcepts (front :: back):\n${conceptBlock}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 3000,
    })
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}') as Partial<InterviewBlueprint>
    if (Array.isArray(parsed.segments) && parsed.segments.length > 0) {
      blueprint = {
        topicTitle: input.topicTitle,
        chapter: input.chapter ?? null,
        opening: typeof parsed.opening === 'string' ? parsed.opening : `Good to see you — let's get straight into ${input.topicTitle}. First question:`,
        segments: parsed.segments.map((s) => ({
          concept: String(s?.concept ?? 'Concept'),
          questions: Array.isArray(s?.questions)
            ? s.questions.slice(0, 4).map((q) => ({
                type: String(q?.type ?? 'explain'),
                text: String(q?.text ?? ''),
                rubric: String(q?.rubric ?? ''),
              })).filter((q) => q.text)
            : [],
          followUps: String(s?.followUps ?? ''),
        })).filter((s) => s.questions.length > 0),
        rubric: {
          dimensions: Array.isArray(parsed.rubric?.dimensions) && parsed.rubric!.dimensions.length
            ? parsed.rubric!.dimensions.map(String)
            : ['recall', 'understanding', 'application', 'reasoning', 'communication'],
          scale: typeof parsed.rubric?.scale === 'string' ? parsed.rubric!.scale : '1-10',
        },
        closing: typeof parsed.closing === 'string' ? parsed.closing : 'Thank you — that wraps up our viva.',
      }
    }
  } catch {
    blueprint = null
  }

  if (!blueprint) {
    // Minimal fallback from the raw concepts.
    blueprint = {
      topicTitle: input.topicTitle,
      chapter: input.chapter ?? null,
      opening: `Good to see you — let's get straight into ${input.topicTitle}. First question coming up.`,
      segments: concepts.slice(0, 6).map((c) => ({
        concept: c.front,
        questions: [
          { type: 'explain', text: `In your own words, explain ${c.front}.`, rubric: c.back },
          { type: 'apply', text: `Where might ${c.front} show up in everyday life?`, rubric: 'a sensible real-world example' },
        ],
        followUps: 'Push one step deeper if confident; give a single hint if stuck.',
      })),
      rubric: { dimensions: ['recall', 'understanding', 'application', 'reasoning', 'communication'], scale: '1-10' },
      closing: 'Thank you — that brings our viva to a close.',
    }
  }

  return {
    blueprint,
    focusAreas: blueprint.segments.map((s) => s.concept),
    knowledgeMarkdown: renderKnowledgeMarkdown(blueprint),
  }
}

/**
 * Render the blueprint as a Markdown knowledge document for the Runway avatar.
 * The avatar's personality instructs it to follow this as its question plan.
 */
export function renderKnowledgeMarkdown(bp: InterviewBlueprint): string {
  const lines: string[] = []
  lines.push(`# Oral Viva Plan — ${bp.topicTitle}${bp.chapter ? ` (${bp.chapter})` : ''}`)
  lines.push('')
  lines.push('You are running a brisk ~3-minute oral exam using the plan below. Open with a quick greeting and your FIRST question immediately — never say "how can I help" or wait to be prompted; the student is here to be examined. Ask ONE challenging question at a time, listen, react in a few words, then go straight to the next. Keep a fast pace and get through as many questions as you can in the time. Prefer "why / what-if / how would you use this / explain the difference / what is wrong with this" questions over simple recall. Climb in difficulty: if they nail it, push harder; if they are stuck, give ONE quick hint and move on. Never read this plan aloud, and never reveal the rubric or answers.')
  lines.push('')
  lines.push(`## Opening\n${bp.opening}`)
  lines.push('')
  bp.segments.forEach((s, i) => {
    lines.push(`## ${i + 1}. ${s.concept}`)
    s.questions.forEach((q) => {
      lines.push(`- (${q.type}) ${q.text}`)
      if (q.rubric) lines.push(`  - A strong answer: ${q.rubric}`)
    })
    if (s.followUps) lines.push(`- Follow-up guidance: ${s.followUps}`)
    lines.push('')
  })
  lines.push(`## Closing\n${bp.closing}`)
  lines.push('')
  lines.push(`## Scoring focus (do not say aloud)\nJudge across: ${bp.rubric.dimensions.join(', ')} on a ${bp.rubric.scale} scale.`)
  return lines.join('\n')
}

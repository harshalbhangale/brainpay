/**
 * Persona plan — the question schema that drives BOTH the chat persona builder
 * and the evolving orb. Each captured answer = one "facet" added to the orb and
 * one notch on the completeness ring, so the animation maps 1:1 to real data.
 *
 * The field keys match what the backend already expects on `persona` (see the
 * old Onboarding), so persistence via PATCH /me is unchanged.
 */
import {
  MessagesSquare, Lock, Scale, Wind, Compass, Building2, Baby, User, Users, UsersRound,
  HandHelping, Target, Apple, Lightbulb, Heart, Flame,
  Gamepad2, Trophy, Palette, Music, BookOpen, Cat, FlaskConical,
  Gift, Smartphone, Shirt, Ticket, PiggyBank, Coins,
  type LucideIcon,
} from 'lucide-react'

export type Pastel = 'sky' | 'mint' | 'butter' | 'lilac' | 'peach' | 'blush'

export type Choice = { id: string; label: string; Icon: LucideIcon; sub?: string; hue?: number }

export type Question = {
  /** persona field this answer writes to */
  key: string
  /** how the user answers */
  kind: 'text' | 'single' | 'multi'
  /** what the assistant "says" */
  prompt: string
  /** short helper under the prompt */
  hint?: string
  /** placeholder for text answers */
  placeholder?: string
  /** options for single/multi */
  options?: Choice[]
  /** short chip label summarising the captured value (for the orb) */
  summarise: (value: string | string[]) => string
  /** hue (0-360) this answer contributes to the orb's identity color */
  hueOf?: (value: string | string[]) => number
}

/* Pal-ish hues used to tint the orb as it learns. */
const HUE = { lime: 78, indigo: 248, sky: 205, mint: 152, lilac: 262, peach: 22, blush: 338 }

/* ───────────────────────────────────────────────────────────────── KID plan */
export const KID_PLAN: Question[] = [
  {
    key: 'name',
    kind: 'text',
    prompt: "Hey! I'm going to build your BrainPal. First — what's your name?",
    hint: 'So your Pals know what to call you.',
    placeholder: 'Your name',
    summarise: (v) => String(v),
    hueOf: () => HUE.lime,
  },
  {
    key: 'age',
    kind: 'single',
    prompt: 'Nice to meet you! How old are you?',
    hint: "We'll keep everything just right for your age.",
    options: [
      { id: '8–9', label: '8–9', Icon: Baby },
      { id: '10–11', label: '10–11', Icon: User },
      { id: '12–13', label: '12–13', Icon: User },
      { id: '14+', label: '14+', Icon: Users },
    ],
    summarise: (v) => `Age ${v}`,
    hueOf: () => HUE.sky,
  },
  {
    key: 'interests',
    kind: 'multi',
    prompt: 'What do you love doing?',
    hint: 'Pick as many as you like.',
    options: [
      { id: 'gaming', label: 'Gaming', Icon: Gamepad2, hue: HUE.indigo },
      { id: 'sports', label: 'Sports', Icon: Trophy, hue: HUE.mint },
      { id: 'art', label: 'Art', Icon: Palette, hue: HUE.blush },
      { id: 'music', label: 'Music', Icon: Music, hue: HUE.lilac },
      { id: 'reading', label: 'Reading', Icon: BookOpen, hue: HUE.peach },
      { id: 'animals', label: 'Animals', Icon: Cat, hue: 40 },
      { id: 'science', label: 'Science', Icon: FlaskConical, hue: HUE.sky },
    ],
    summarise: (v) => (Array.isArray(v) && v.length > 1 ? `${v.length} interests` : `Loves ${String(Array.isArray(v) ? v[0] : v)}`),
    hueOf: (v) => HUE.indigo,
  },
  {
    key: 'savingGoal',
    kind: 'single',
    prompt: 'Saving up for anything special?',
    hint: 'Your Pals will cheer you on.',
    options: [
      { id: 'game', label: 'A video game', Icon: Gamepad2 },
      { id: 'gadget', label: 'A gadget', Icon: Smartphone },
      { id: 'toy', label: 'A toy / Lego', Icon: Gift },
      { id: 'clothes', label: 'Clothes / shoes', Icon: Shirt },
      { id: 'experience', label: 'An outing', Icon: Ticket },
      { id: 'saving', label: 'Just saving up!', Icon: PiggyBank },
    ],
    summarise: (v) => 'Has a goal',
    hueOf: () => HUE.lime,
  },
  {
    key: 'spend_style',
    kind: 'single',
    prompt: 'Last one — are you more of a…',
    hint: 'No wrong answer!',
    options: [
      { id: 'saver', label: 'A saver', Icon: PiggyBank, sub: 'I like watching it grow' },
      { id: 'mixed', label: 'A bit of both', Icon: Scale, sub: 'Depends on the day' },
      { id: 'impulse', label: 'A spender', Icon: Coins, sub: 'I love treating myself' },
    ],
    summarise: (v) => (v === 'saver' ? 'Saver' : v === 'impulse' ? 'Spender' : 'Balanced'),
    hueOf: (v) => (v === 'saver' ? HUE.lime : v === 'impulse' ? HUE.blush : HUE.sky),
  },
]

/* ────────────────────────────────────────────────────────────── PARENT plan */
export const PARENT_PLAN: Question[] = [
  {
    key: 'name',
    kind: 'text',
    prompt: "Welcome! Let's set up your family. What do your kids call you?",
    hint: 'Mum, Dad, Sarah — whatever works.',
    placeholder: 'e.g. Mum',
    summarise: (v) => String(v),
    hueOf: () => HUE.sky,
  },
  {
    key: 'money_upbringing',
    kind: 'single',
    prompt: 'Growing up, was money talked about openly?',
    hint: 'This shapes how your Pals communicate with you.',
    options: [
      { id: 'open', label: 'We talked about it', Icon: MessagesSquare, sub: 'Dinner-table conversation' },
      { id: 'private', label: 'It was private', Icon: Lock, sub: "We didn't really discuss it" },
      { id: 'mixed', label: 'In between', Icon: Scale, sub: 'Depended on the situation' },
    ],
    summarise: (v) => (v === 'open' ? 'Open about money' : v === 'private' ? 'Private about money' : 'Mixed'),
    hueOf: () => HUE.sky,
  },
  {
    key: 'parenting_style',
    kind: 'single',
    prompt: "When your kid wants something they can't afford yet…",
    hint: "What's your instinct?",
    options: [
      { id: 'autonomous', label: 'Let them figure it out', Icon: Wind, sub: 'Consequences teach best' },
      { id: 'guided', label: 'Guide them through it', Icon: Compass, sub: 'I explain the why' },
      { id: 'structured', label: 'Set the structure', Icon: Building2, sub: 'Clear rules and limits' },
    ],
    summarise: (v) => (v === 'autonomous' ? 'Hands-off' : v === 'structured' ? 'Structured' : 'Guiding'),
    hueOf: (v) => (v === 'structured' ? HUE.indigo : v === 'autonomous' ? HUE.mint : HUE.sky),
  },
  {
    key: 'kid_situation',
    kind: 'single',
    prompt: 'Tell me about your kid situation.',
    hint: 'Your Pals calibrate suggestions to this.',
    options: [
      { id: 'one_young', label: 'One kid (under 10)', Icon: Baby },
      { id: 'one_teen', label: 'One kid (10–14)', Icon: User },
      { id: 'two', label: 'Two kids', Icon: Users },
      { id: 'three_plus', label: 'Three or more', Icon: UsersRound },
      { id: 'mixed', label: 'Mixed ages', Icon: Scale },
    ],
    summarise: (v) => 'Family mapped',
    hueOf: () => HUE.lilac,
  },
  {
    key: 'primary_goal',
    kind: 'single',
    prompt: 'What do you actually want to change?',
    hint: 'Your Pals will celebrate wins that match this.',
    options: [
      { id: 'impulse', label: 'Stop impulse buying', Icon: HandHelping },
      { id: 'save', label: 'Learn to save', Icon: Target },
      { id: 'food', label: 'Better food choices', Icon: Apple },
      { id: 'understand', label: 'Understand money', Icon: Lightbulb },
      { id: 'responsible', label: 'Be more responsible', Icon: Heart },
      { id: 'all', label: 'All of the above', Icon: Flame },
    ],
    summarise: (v) => 'Goal set',
    hueOf: () => HUE.lime,
  },
]

export function planFor(role: 'parent' | 'kid'): Question[] {
  return role === 'kid' ? KID_PLAN : PARENT_PLAN
}
